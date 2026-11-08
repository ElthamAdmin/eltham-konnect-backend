const crypto = require("crypto");
const mongoose = require("mongoose");
const {
  assertCollectibleBalance,
} = require("../services/arBalanceService");
const Customer = require("../models/Customer");
const Package = require("../models/Package");
const Invoice = require("../models/Invoice");
const CustomerPurchase = require("../models/CustomerPurchase");
const HREmployee = require("../models/HREmployee");
const Payroll = require("../models/Payroll");
const ShippingRate = require("../models/ShippingRate");
const FinancialAccount = require("../models/FinancialAccount");
const ChartOfAccount = require("../models/ChartOfAccount");
const AccountTransaction = require("../models/AccountTransaction");
const CustomerNotification = require("../models/CustomerNotification");
const PointsHistory = require("../models/PointsHistory");
const { writeAuditLog } = require("../utils/auditLogger");
const {
  postCustomerInvoice,
  receiveInvoicePayment,
  postCustomerPurchaseRecoveryInvoice,
} = require("../services/accountingService");

const {
  getRecoveryInvoiceData,
  markPurchasesInvoiced,
  allocateInvoicePaymentToPurchases,
} = require("../services/customerPurchaseIntegrationService");

const {
  applyInvoicePoints,
} = require("../services/invoicePointsAdjustmentService");

const {
  updateInvoiceCharges,
} = require("../services/invoiceChargeAdjustmentService");

const {
  runPaymentOnce,
} = require("../services/paymentRequestService");

const getJamaicaDateString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
};

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calculateBaseCurrencyAmount = ({
  amount,
  currency,
  exchangeRate,
}) => {
  const numericAmount = roundMoney(amount);

  const normalizedCurrency = String(
    currency || "JMD"
  ).toUpperCase();

  if (normalizedCurrency === "JMD") {
    return numericAmount;
  }

  return roundMoney(
    numericAmount * Number(exchangeRate || 1)
  );
};

const syncFinancialAccountFromLedger = async (
  account,
  session = null
) => {

    const linkedChartAccount = await ChartOfAccount.findOne({
    accountCode: account.linkedChartAccountCode,
  }).session(session);

  if (!linkedChartAccount) return account;

  account.currentBalance = roundMoney(linkedChartAccount.currentBalance || 0);
  account.baseCurrencyBalance = calculateBaseCurrencyAmount({
    amount: account.currentBalance,
    currency: account.currency,
    exchangeRate: account.exchangeRate,
  });

  await account.save(session ? { session } : {});
    return account;
};

const getInvoiceChargesFromBody = (body = {}) => ({
  customsDuty: roundMoney(body.customsDuty),
  gct: roundMoney(body.gct),
  processingFee: roundMoney(body.processingFee),
  deliveryFee: roundMoney(body.deliveryFee),
  deliveryType: String(body.deliveryType || "").trim(),
  otherAdjustment: roundMoney(body.otherAdjustment),
  adjustmentNote: String(body.adjustmentNote || "").trim(),
});

const calculateInvoiceFinalTotal = ({
  subtotal = 0,
  customsDuty = 0,
  gct = 0,
  processingFee = 0,
  deliveryFee = 0,
  otherAdjustment = 0,
  pointsRedeemed = 0,
}) => {
  return Math.max(
    0,
    roundMoney(
      Number(subtotal || 0) +
        Number(customsDuty || 0) +
        Number(gct || 0) +
        Number(processingFee || 0) +
        Number(deliveryFee || 0) +
        Number(otherAdjustment || 0) -
        Number(pointsRedeemed || 0)
    )
  );
};

const createCustomerNotification = async ({
  customerEkonId,
  customerName,
  title,
  message,
  type,
  referenceType = "",
  referenceId = "",
  session = null,
}) => {
  const notification = {
    notificationNumber: `NTF-${crypto.randomUUID()}`,
    customerEkonId,
    customerName,
    title,
    message,
    type,
    referenceType,
    referenceId,
    isRead: false,
    date: getJamaicaDateString(),
  };

  if (session) {
    await CustomerNotification.create(
      [notification],
      { session }
    );
  } else {
    await CustomerNotification.create(notification);
  }
};

const createRedemptionHistory = async ({ customer, invoice, redeemAmount }) => {
  if (Number(redeemAmount || 0) <= 0) return;

  await PointsHistory.create({
    customerEkonId: customer.ekonId,
    customerName: customer.name,
    action: `Redeemed on ${invoice.invoiceNumber}`,
    points: -Math.abs(Number(redeemAmount || 0)),
    reference: invoice.invoiceNumber,
    note: `Applied JMD ${Number(redeemAmount || 0).toLocaleString()} in EK Points to invoice ${invoice.invoiceNumber}`,
    date: getJamaicaDateString(),
  });
};

const {
  createFreightInvoice,
  createRecoveryInvoice,
} = require("../services/invoiceCreationService");

const runInvoiceCreation = async (req, res, kind) => {
  try {
    const invoice =
      kind === "recovery"
        ? await createRecoveryInvoice({
            body: req.body || {},
            user: req.user,
          })
        : await createFreightInvoice({
            body: req.body || {},
            user: req.user,
            allReady: kind === "all-ready",
          });

    return res.status(201).json({
      success: true,
      message: "Invoice generated successfully.",
      data: invoice,
      journalEntryNumber: invoice.journalEntryNumber,
    });
  } catch (error) {
    console.error("Invoice creation failed:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Could not confirm invoice creation. Refresh invoices before retrying.",
    });
  }
};

const createInvoice = (req, res) =>
  runInvoiceCreation(req, res, "all-ready");

const generateMultipleInvoice = (req, res) =>
  runInvoiceCreation(req, res, "selected");

const generateCustomerPurchaseInvoice = (req, res) =>
  runInvoiceCreation(req, res, "recovery");

const getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ _id: -1 });
    res.json({
      success: true,
      message: "Invoices retrieved successfully",
      totalInvoices: invoices.length,
      data: invoices,
    });
  } catch (error) {
    console.error("Error retrieving invoices:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve invoices",
      error: error.message,
    });
  }
};

const getMyInvoices = async (req, res) => {
  try {
    const customerEkonId = String(req.user?.ekonId || "")
      .trim()
      .toUpperCase();

    if (!customerEkonId) {
      return res.status(401).json({
        success: false,
        message: "Customer authentication is required.",
      });
    }

    const invoices = await Invoice.find({
      customerEkonId,
    })
      .select(
        [
          "invoiceNumber",
          "customerEkonId",
          "customerName",
          "packageCount",
          "packages",
          "invoiceSource",
          "customerPurchaseCount",
          "customerPurchases",
          "customerPurchaseRecoveryAmount",
          "shoppingAssistanceFee",
          "customerPurchaseWeightCharge",
          "customerPurchaseShippingCharge",
          "customerPurchaseCustomsDuty",
          "customerPurchaseDeliveryFee",
          "customerPurchaseOtherCharges",
          "customerPurchaseTotal",
          "storageFeeTotal",
          "storageFeeLines",
          "subtotal",
          "customsDuty",
          "gct",
          "processingFee",
          "deliveryFee",
          "deliveryType",
          "otherAdjustment",
          "adjustmentNote",
          "pointsRedeemed",
          "finalTotal",
          "amountPaid",
          "balanceDue",
          "dueDate",
          "paymentTerms",
          "status",
          "paymentLink",
          "paidDate",
          "paidAt",
          "paymentMethod",
          "createdAt",
        ].join(" ")
      )
      .sort({ _id: -1 })
      .lean();

    return res.json({
      success: true,
      message: "Customer invoices retrieved successfully",
      totalInvoices: invoices.length,
      data: invoices,
    });
  } catch (error) {
    console.error("Error retrieving customer invoices:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve your invoices",
      error: error.message,
    });
  }
};

const updateInvoicePaymentLink = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const paymentLink = String(req.body?.paymentLink || "").trim();

    const invoice = await Invoice.findOneAndUpdate(
      { invoiceNumber },
      { $set: { paymentLink } },
      { new: true }
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    await writeAuditLog({
      req,
      action: "UPDATE_INVOICE_PAYMENT_LINK",
      module: "Invoices",
      description: `Payment link updated for invoice ${invoice.invoiceNumber}`,
      targetType: "Invoice",
      targetId: invoice.invoiceNumber,
      metadata: {
        customerName: invoice.customerName,
        paymentLink: invoice.paymentLink,
      },
    });

    res.json({
      success: true,
      message: "Invoice payment link updated successfully",
      data: invoice,
    });
  } catch (error) {
    console.error("Error updating invoice payment link:", error);
    res.status(500).json({
      success: false,
      message: "Could not update invoice payment link",
      error: error.message,
    });
  }
};

const applyInvoicePointsAdjustment = async (req, res) => {
  try {
    const result = await applyInvoicePoints({
      invoiceNumber: req.params.invoiceNumber,
      pointsToRedeem: req.body?.pointsToRedeem,
      req,
    });

    return res.json({
      success: true,
      message:
        `JMD ${result.redeemAmount.toLocaleString()} ` +
        "in EK points applied successfully.",
      data: result.invoice,
      customer: result.customer,
      redeemAmount: result.redeemAmount,
      journalEntryNumber: result.journalEntryNumber,
    });
  } catch (error) {
    console.error("Error applying invoice points:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode
          ? error.message
          : "Could not apply EK points. No changes were committed.",
    });
  }
};

const updateInvoiceChargesAdjustment = async (req, res) => {
  try {
    const result = await updateInvoiceCharges({
      invoiceNumber: req.params.invoiceNumber,
      changes: req.body || {},
      req,
    });

    return res.json({
      success: true,
      message: "Invoice charges updated successfully.",
      data: result.invoice,
      journalEntryNumber: result.journalEntryNumber,
    });
  } catch (error) {
    console.error("Error updating invoice charges:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Could not update invoice charges. No changes were committed.",
    });
  }
};

const markInvoicePaid = async (req, res) => {
  const fail = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  };

  try {
        const result = await runPaymentOnce({
      req,
      channel: "Invoices",
      execute: async (session, paymentRequestFields) => {
        const { invoiceNumber } = req.params;

        const {
          receivingAccountNumber,
          paymentMethod = "Cash",
          amountTendered,
          paymentAmount,
        } = req.body;

        if (!receivingAccountNumber) {
          fail("Receiving account is required.");
        }

        const invoice = await Invoice.findOne({
          invoiceNumber,
        }).session(session);

        if (!invoice) {
          fail("Invoice not found.", 404);
        }

        if (
          [
            "Paid",
            "Cancelled",
            "Refunded",
            "Written Off",
            "Reversed",
          ].includes(invoice.status)
        ) {
          fail(
            `A ${invoice.status} invoice cannot receive a payment.`
          );
        }

        const account = await FinancialAccount.findOne({
          accountNumber: receivingAccountNumber,
          status: "Active",
        }).session(session);

        if (!account) {
          fail(
            "Receiving account not found or inactive.",
            404
          );
        }

        const finalTotal = roundMoney(invoice.finalTotal);
        const previouslyPaid = roundMoney(invoice.amountPaid);

        if (
          !Number.isFinite(finalTotal) ||
          !Number.isFinite(previouslyPaid) ||
          previouslyPaid < 0
        ) {
          fail(
            "The invoice has invalid payment amounts.",
            409
          );
        }

                const outstandingBeforePayment =
          assertCollectibleBalance(invoice);

        if (outstandingBeforePayment <= 0) {
          fail("This invoice has no outstanding balance.");
        }

        const supplied = (value) =>
          value !== undefined &&
          value !== null &&
          value !== "";

        const actualPaymentAmount = roundMoney(
          supplied(paymentAmount)
            ? paymentAmount
            : supplied(amountTendered)
              ? amountTendered
              : outstandingBeforePayment
        );

        if (
          !Number.isFinite(actualPaymentAmount) ||
          actualPaymentAmount <= 0
        ) {
          fail("Payment amount must be greater than zero.");
        }

        if (
          actualPaymentAmount > outstandingBeforePayment
        ) {
          fail(
            "Payment amount cannot exceed outstanding balance."
          );
        }

        const tenderedAmountValue = supplied(amountTendered)
          ? roundMoney(amountTendered)
          : actualPaymentAmount;

        if (
          !Number.isFinite(tenderedAmountValue) ||
          tenderedAmountValue < actualPaymentAmount
        ) {
          fail(
            "Amount tendered cannot be less than payment amount."
          );
        }

        const changeGiven = roundMoney(
          tenderedAmountValue - actualPaymentAmount
        );

        const paymentJournalEntry =
          await receiveInvoicePayment({
            session,
            invoice,
            receivingAccount: account,
            amount: actualPaymentAmount,
            user: req.user,
          });

        const now = new Date();

        invoice.amountPaid = roundMoney(
          previouslyPaid + actualPaymentAmount
        );

                invoice.balanceDue = roundMoney(
          outstandingBeforePayment - actualPaymentAmount
        );

        invoice.status =
          invoice.balanceDue <= 0
            ? "Paid"
            : "Partially Paid";

        if (invoice.status === "Paid") {
          invoice.paidDate = getJamaicaDateString(now);
          invoice.paidAt = now;
        }

        invoice.paymentMethod = paymentMethod;
        invoice.amountTendered = tenderedAmountValue;
        invoice.changeGiven = changeGiven;
        invoice.paidIntoAccountNumber = account.accountNumber;
        invoice.paidIntoAccountName = account.accountName;

        invoice.cashierName =
          req.user?.fullName ||
          req.user?.name ||
          req.user?.email ||
          "System User";

        invoice.paymentHistory =
          invoice.paymentHistory || [];

        invoice.paymentHistory.push({
          paymentDate: now,
          amount: actualPaymentAmount,
          paymentMethod,
          receivingAccountNumber: account.accountNumber,
          receivingAccountName: account.accountName,
          journalEntryNumber: paymentJournalEntry.entryNumber,
          receivedBy: invoice.cashierName,
        });

        await invoice.save({ session });

        await AccountTransaction.create(
          [
            {
                            transactionNumber:
                `TRN-${crypto.randomUUID()}`,
              ...paymentRequestFields,
              accountNumber: account.accountNumber,
              accountName: account.accountName,
              linkedChartAccountCode:
                account.linkedChartAccountCode || "",
              journalEntryNumber:
                paymentJournalEntry.entryNumber,
              ledgerReference:
                paymentJournalEntry.entryNumber,
                            transactionType: "Invoice Payment",
              branch: String(req.user?.branch || "").trim(),
              cashierUserId: String(
                req.user?.userId || req.user?._id || ""
              ),
              cashierName: invoice.cashierName,
              amount: actualPaymentAmount,
              paymentMethod,
              amountTendered: tenderedAmountValue,
              changeGiven,
              reference: invoice.invoiceNumber,
              notes:
                `Invoice payment received for ${invoice.customerName}`,
              transactionDate: now,
              invoiceNumber: invoice.invoiceNumber,
              customerEkonId: invoice.customerEkonId,
              customerName: invoice.customerName,
            },
          ],
          { session }
        );

        let customerPurchaseAllocation = null;

        if (
          Array.isArray(invoice.customerPurchases) &&
          invoice.customerPurchases.length > 0
        ) {
          customerPurchaseAllocation =
            await allocateInvoicePaymentToPurchases({
              session,
              invoice,
              paymentAmount: actualPaymentAmount,
              paymentJournalEntryNumber:
                paymentJournalEntry.entryNumber,
              paymentDate: now,
              receivedBy: invoice.cashierName,
            });
        }

        await syncFinancialAccountFromLedger(
          account,
          session
        );

        if (invoice.status === "Paid") {
          const trackingNumbers = (invoice.packages || [])
            .map((pkg) => pkg.trackingNumber)
            .filter(Boolean);

          if (trackingNumbers.length > 0) {
            await Package.updateMany(
              {
                customerEkonId: invoice.customerEkonId,
                trackingNumber: {
                  $in: trackingNumbers,
                },
              },
              {
                $set: { invoiceStatus: "Paid" },
              },
              { session }
            );
          }
        }

        await createCustomerNotification({
          session,
          customerEkonId: invoice.customerEkonId,
          customerName: invoice.customerName,
          title:
            invoice.status === "Paid"
              ? "Invoice Paid Successfully"
              : "Invoice Payment Received",
          message:
            `Payment of JMD ${actualPaymentAmount.toLocaleString()} ` +
            `was received for invoice ${invoice.invoiceNumber}. ` +
            `Balance due: JMD ${invoice.balanceDue.toLocaleString()}.`,
          type: "Invoice Update",
          referenceType: "Invoice",
          referenceId: invoice.invoiceNumber,
        });

        await writeAuditLog({
          session,
          req,
          action: "RECEIVE_INVOICE_PAYMENT",
          module: "Invoices",
          description:
            `Payment received for invoice ${invoice.invoiceNumber}`,
          targetType: "Invoice",
          targetId: invoice.invoiceNumber,
          metadata: {
            customerName: invoice.customerName,
            paymentAmount: actualPaymentAmount,
            amountPaid: invoice.amountPaid,
            balanceDue: invoice.balanceDue,
            status: invoice.status,
            journalEntryNumber:
              paymentJournalEntry.entryNumber,
            customerPurchaseAllocation,
          },
        });

        return {
          invoice,
          receivingAccount: account,
          journalEntryNumber:
            paymentJournalEntry.entryNumber,
        };
        },
    });

    return res.json({
      success: true,
            paymentRequestReplayed:
        Boolean(result.paymentRequestReplayed),
      message: "Invoice payment recorded successfully",
      data: result.invoice,
      receivingAccount: result.receivingAccount,
      journalEntryNumber: result.journalEntryNumber,
    });
  } catch (error) {
    console.error("Error updating invoice:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Could not confirm invoice payment completion. Check the invoice and payment records before retrying.",
      error: error.message,
    });
  }
};

const reconcilePaidInvoicePackages = async (req, res) => {
  try {
    const paidInvoices = await Invoice.find({ status: "Paid" })
      .select("customerEkonId packages.trackingNumber")
      .lean();

    let updatedPackages = 0;

    for (const invoice of paidInvoices) {
      const trackingNumbers = (invoice.packages || [])
        .map((pkg) => pkg.trackingNumber)
        .filter(Boolean);

      if (trackingNumbers.length === 0) continue;

      const result = await Package.updateMany(
        {
          customerEkonId: invoice.customerEkonId,
          trackingNumber: { $in: trackingNumbers },
          invoiceStatus: { $ne: "Paid" },
        },
        {
          $set: {
            invoiceStatus: "Paid",
          },
        }
      );

      updatedPackages += result.modifiedCount || 0;
    }

    await writeAuditLog({
      req,
      action: "RECONCILE_PAID_INVOICE_PACKAGES",
      module: "Invoices",
      description:
        "Reconciled package invoice statuses against paid invoices.",
      targetType: "Package",
      targetId: "PAID-INVOICE-RECONCILE",
      metadata: {
        paidInvoiceCount: paidInvoices.length,
        updatedPackages,
      },
    });

    return res.json({
      success: true,
      message:
        "Package payment statuses reconciled. Collection statuses were preserved.",
      paidInvoiceCount: paidInvoices.length,
      updatedPackages,
    });
  } catch (error) {
    console.error("Reconcile paid invoice packages error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not reconcile package payment statuses.",
      error: error.message,
    });
  }
};

module.exports = {
  createInvoice,
  generateMultipleInvoice,
  generateCustomerPurchaseInvoice,
  getInvoices,
  getMyInvoices,
  updateInvoicePaymentLink,
  updateInvoiceChargesAdjustment,
  applyInvoicePointsAdjustment,
  markInvoicePaid,
  reconcilePaidInvoicePackages,
};