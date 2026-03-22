const Customer = require("../models/Customer");
const Package = require("../models/Package");
const Invoice = require("../models/Invoice");
const ShippingRate = require("../models/ShippingRate");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const { writeAuditLog } = require("../utils/auditLogger");

const getJamaicaDateString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
};

const createInvoice = async (req, res) => {
  try {
    const { customerEkonId, pointsToRedeem } = req.body;

    const customer = await Customer.findOne({ ekonId: customerEkonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const readyPackages = await Package.find({
      customerEkonId,
      readyForPickup: true,
      invoiceStatus: "Pending",
    });

    if (readyPackages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No ready packages with pending invoice.",
      });
    }

    const ratedPackages = [];

    for (const pkg of readyPackages) {
      const roundedWeight = Math.ceil(Number(pkg.weight || 0));
      const rateDoc = await ShippingRate.findOne({ weight: roundedWeight });

      if (!rateDoc) {
        return res.status(400).json({
          success: false,
          message: `No shipping rate found for ${roundedWeight} lb`,
        });
      }

      ratedPackages.push({
        trackingNumber: pkg.trackingNumber,
        chargeableWeight: roundedWeight,
        rate: Number(rateDoc.price || 0),
      });
    }

    const subtotal = ratedPackages.reduce(
      (sum, pkg) => sum + Number(pkg.rate || 0),
      0
    );

    const requestedPoints = Number(pointsToRedeem) || 0;
    let redeemAmount = 0;

    if (requestedPoints > 0) {
      if (Number(customer.pointsBalance || 0) < 500) {
        return res.status(400).json({
          success: false,
          message: "Minimum 500 points required before redeeming.",
        });
      }

      if (requestedPoints > Number(customer.pointsBalance || 0)) {
        return res.status(400).json({
          success: false,
          message: "Customer does not have enough points.",
        });
      }

      redeemAmount = Math.min(requestedPoints, subtotal);

      customer.pointsBalance = Number(customer.pointsBalance || 0) - redeemAmount;
      customer.lastActivityDate = getJamaicaDateString();
      await customer.save();
    }

    const finalTotal = subtotal - redeemAmount;

    const invoice = await Invoice.create({
      invoiceNumber: `INV-${Date.now()}`,
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      packageCount: ratedPackages.length,
      packages: ratedPackages,
      subtotal,
      pointsRedeemed: redeemAmount,
      finalTotal,
      status: "Unpaid",
      paymentLink: "",
      paidDate: null,
      paidAt: null,
      createdAt: getJamaicaDateString(),
    });

    await Package.updateMany(
      {
        customerEkonId,
        readyForPickup: true,
        invoiceStatus: "Pending",
      },
      {
        $set: { invoiceStatus: "Issued" },
      }
    );

    await writeAuditLog({
      req,
      action: "CREATE_INVOICE",
      module: "Invoices",
      description: `Invoice ${invoice.invoiceNumber} created for ${invoice.customerName}`,
      targetType: "Invoice",
      targetId: invoice.invoiceNumber,
      metadata: {
        customerEkonId: invoice.customerEkonId,
        packageCount: invoice.packageCount,
        subtotal: invoice.subtotal,
        pointsRedeemed: invoice.pointsRedeemed,
        finalTotal: invoice.finalTotal,
      },
    });

    res.json({
      success: true,
      message: "Invoice created successfully from ready packages",
      data: invoice,
    });
  } catch (error) {
    console.error("Invoice creation error:", error);
    res.status(500).json({
      success: false,
      message: "Invoice could not be created",
      error: error.message,
    });
  }
};

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
    });
  }
};

const updateInvoicePaymentLink = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { paymentLink } = req.body;

    const invoice = await Invoice.findOne({ invoiceNumber });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    invoice.paymentLink = paymentLink || "";
    await invoice.save();

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

const markInvoicePaid = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { receivingAccountNumber } = req.body;

    if (!receivingAccountNumber) {
      return res.status(400).json({
        success: false,
        message: "Receiving account is required",
      });
    }

    const invoice = await Invoice.findOne({ invoiceNumber });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    if (invoice.status === "Paid") {
      return res.status(400).json({
        success: false,
        message: "Invoice is already marked as paid",
      });
    }

    const account = await FinancialAccount.findOne({
      accountNumber: receivingAccountNumber,
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Receiving account not found",
      });
    }

    const now = new Date();

    invoice.status = "Paid";
    invoice.paidDate = getJamaicaDateString(now);
    invoice.paidAt = now;
    await invoice.save();

    account.currentBalance =
      Number(account.currentBalance || 0) + Number(invoice.finalTotal || 0);
    await account.save();

    await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}`,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      transactionType: "Invoice Payment",
      amount: Number(invoice.finalTotal || 0),
      reference: invoice.invoiceNumber,
      notes: `Invoice payment received for ${invoice.customerName}`,
      transactionDate: now,
    });

    const trackingNumbers = (invoice.packages || []).map((pkg) => pkg.trackingNumber);

    await Package.updateMany(
      { trackingNumber: { $in: trackingNumbers } },
      {
        $set: {
          status: "Delivered",
          readyForPickup: false,
          invoiceStatus: "Paid",
        },
      }
    );

    await writeAuditLog({
      req,
      action: "MARK_INVOICE_PAID",
      module: "Invoices",
      description: `Invoice ${invoice.invoiceNumber} marked paid and deposited into ${account.accountName}`,
      targetType: "Invoice",
      targetId: invoice.invoiceNumber,
      metadata: {
        customerName: invoice.customerName,
        finalTotal: invoice.finalTotal,
        receivingAccountNumber: account.accountNumber,
        receivingAccountName: account.accountName,
        paidDate: invoice.paidDate,
      },
    });

    res.json({
      success: true,
      message: "Invoice marked as paid, account updated, and packages delivered",
      data: invoice,
      receivingAccount: account,
    });
  } catch (error) {
    console.error("Error updating invoice:", error);
    res.status(500).json({
      success: false,
      message: "Could not update invoice",
      error: error.message,
    });
  }
};

module.exports = {
  createInvoice,
  getInvoices,
  updateInvoicePaymentLink,
  markInvoicePaid,
};