const Customer = require("../models/Customer");
const Package = require("../models/Package");
const Invoice = require("../models/Invoice");
const HREmployee = require("../models/HREmployee");
const Payroll = require("../models/Payroll");
const ShippingRate = require("../models/ShippingRate");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const CustomerNotification = require("../models/CustomerNotification");
const PointsHistory = require("../models/PointsHistory");
const { writeAuditLog } = require("../utils/auditLogger");
const {
  postJournalEntry,
  SYSTEM_ACCOUNTS,
  ensureSystemAccounts,
} = require("../utils/generalLedgerPoster");
const ChartOfAccount = require("../models/ChartOfAccount");

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

const syncFinancialAccountFromLedger = async (account) => {
  if (!account || !account.linkedChartAccountCode) return account;

  const linkedChartAccount = await ChartOfAccount.findOne({
    accountCode: account.linkedChartAccountCode,
  });

  if (!linkedChartAccount) return account;

  account.currentBalance = roundMoney(linkedChartAccount.currentBalance || 0);
  account.baseCurrencyBalance = calculateBaseCurrencyAmount({
    amount: account.currentBalance,
    currency: account.currency,
    exchangeRate: account.exchangeRate,
  });

  await account.save();
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
}) => {
  await CustomerNotification.create({
    notificationNumber: `NTF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    customerEkonId,
    customerName,
    title,
    message,
    type,
    referenceType,
    referenceId,
    isRead: false,
    date: getJamaicaDateString(),
  });
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
  invoiceStatus: { $ne: "Issued" },
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

    const invoiceCharges = getInvoiceChargesFromBody(req.body);

const finalTotal = calculateInvoiceFinalTotal({
  subtotal,
  ...invoiceCharges,
  pointsRedeemed: redeemAmount,
});

    const invoice = await Invoice.create({
      invoiceNumber: `INV-${Date.now()}`,
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      packageCount: ratedPackages.length,
      packages: ratedPackages,
      subtotal,
      customsDuty: invoiceCharges.customsDuty,
      gct: invoiceCharges.gct,
      processingFee: invoiceCharges.processingFee,
      deliveryFee: invoiceCharges.deliveryFee,
      deliveryType: invoiceCharges.deliveryType,
      otherAdjustment: invoiceCharges.otherAdjustment,
      adjustmentNote: invoiceCharges.adjustmentNote,
      pointsRedeemed: redeemAmount,
      finalTotal,
      status: "Unpaid",
      paymentLink: "",
      paidDate: null,
      paidAt: null,
      createdAt: getJamaicaDateString(),
    });

    await createRedemptionHistory({ customer, invoice, redeemAmount });

   const invoicedTrackingNumbers = ratedPackages.map((pkg) => pkg.trackingNumber);

await Package.updateMany(
  { trackingNumber: { $in: invoicedTrackingNumbers } },
  { $set: { invoiceStatus: "Issued" } }
);

    await createCustomerNotification({
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      title: "New Invoice Generated",
      message: `A new invoice ${invoice.invoiceNumber} has been generated for your ready packages. Final total: JMD ${Number(invoice.finalTotal || 0).toLocaleString()}.`,
      type: "Invoice Update",
      referenceType: "Invoice",
      referenceId: invoice.invoiceNumber,
    });

    const accountsReceivableAccount =
  await ChartOfAccount.findOne({
    accountCode: "1100",
  });

const revenueAccount =
  await ChartOfAccount.findOne({
    accountCode: "4000",
  });

  await ensureSystemAccounts();

if (
  accountsReceivableAccount &&
  revenueAccount
) {
  await postJournalEntry({
    entryDate: getJamaicaDateString(),
    memo: `Invoice created for ${invoice.customerName}`,
    reference: invoice.invoiceNumber,
    sourceModule: "Invoices",
    createdBy: req.user?.name || "System User",
    lines: [
      {
        accountCode:
          accountsReceivableAccount.accountCode,
        accountName:
          accountsReceivableAccount.accountName,
        debit: Number(invoice.finalTotal || 0),
        credit: 0,
        description:
          "Customer invoice receivable",
      },
      {
        accountCode:
          revenueAccount.accountCode,
        accountName:
          revenueAccount.accountName,
        debit: 0,
        credit: Number(invoice.finalTotal || 0),
        description:
          "Shipping revenue earned",
      },
    ],
  });
}

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

const generateMultipleInvoice = async (req, res) => {
  try {
    const { customerEkonId, packageIds, pointsToRedeem } = req.body;

    if (!customerEkonId) {
      return res.status(400).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (!Array.isArray(packageIds) || packageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid ready packages selected",
      });
    }

    const customer = await Customer.findOne({ ekonId: customerEkonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const readyPackages = await Package.find({
  _id: { $in: packageIds },
  customerEkonId,
  readyForPickup: true,
  invoiceStatus: { $ne: "Issued" },
});

    if (readyPackages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid ready packages selected",
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

    const invoiceCharges = getInvoiceChargesFromBody(req.body);

const finalTotal = calculateInvoiceFinalTotal({
  subtotal,
  ...invoiceCharges,
  pointsRedeemed: redeemAmount,
});

    const invoice = await Invoice.create({
      invoiceNumber: `INV-${Date.now()}`,
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      packageCount: ratedPackages.length,
      packages: ratedPackages,
subtotal,
customsDuty: invoiceCharges.customsDuty,
gct: invoiceCharges.gct,
processingFee: invoiceCharges.processingFee,
deliveryFee: invoiceCharges.deliveryFee,
deliveryType: invoiceCharges.deliveryType,
otherAdjustment: invoiceCharges.otherAdjustment,
adjustmentNote: invoiceCharges.adjustmentNote,
      pointsRedeemed: redeemAmount,
      finalTotal,
      status: "Unpaid",
      paymentLink: "",
      paidDate: null,
      paidAt: null,
      createdAt: getJamaicaDateString(),
    });

    await createRedemptionHistory({ customer, invoice, redeemAmount });

    await Package.updateMany(
      { _id: { $in: readyPackages.map((pkg) => pkg._id) } },
      { $set: { invoiceStatus: "Issued" } }
    );

    await createCustomerNotification({
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      title: "New Invoice Generated",
      message: `A new invoice ${invoice.invoiceNumber} has been generated for your ready packages. Final total: JMD ${Number(invoice.finalTotal || 0).toLocaleString()}.`,
      type: "Invoice Update",
      referenceType: "Invoice",
      referenceId: invoice.invoiceNumber,
    });

    const accountsReceivableAccount =
  await ChartOfAccount.findOne({
    accountCode: "1100",
  });

const revenueAccount =
  await ChartOfAccount.findOne({
    accountCode: "4000",
  });

  await ensureSystemAccounts();

if (
  accountsReceivableAccount &&
  revenueAccount
) {
  await postJournalEntry({
    entryDate: getJamaicaDateString(),
    memo: `Invoice created for ${invoice.customerName}`,
    reference: invoice.invoiceNumber,
    sourceModule: "Invoices",
    createdBy: req.user?.name || "System User",
    lines: [
      {
        accountCode:
          accountsReceivableAccount.accountCode,
        accountName:
          accountsReceivableAccount.accountName,
        debit: Number(invoice.finalTotal || 0),
        credit: 0,
        description:
          "Customer invoice receivable",
      },
      {
        accountCode:
          revenueAccount.accountCode,
        accountName:
          revenueAccount.accountName,
        debit: 0,
        credit: Number(invoice.finalTotal || 0),
        description:
          "Shipping revenue earned",
      },
    ],
  });
}

    await writeAuditLog({
      req,
      action: "CREATE_INVOICE",
      module: "Invoices",
      description: `Invoice ${invoice.invoiceNumber} created for ${invoice.customerName} from selected ready packages`,
      targetType: "Invoice",
      targetId: invoice.invoiceNumber,
      metadata: {
        customerEkonId: invoice.customerEkonId,
        packageCount: invoice.packageCount,
        subtotal: invoice.subtotal,
        pointsRedeemed: invoice.pointsRedeemed,
        finalTotal: invoice.finalTotal,
        selectedPackageIds: readyPackages.map((pkg) => String(pkg._id)),
      },
    });

    res.json({
      success: true,
      message: "Bulk invoice created",
      data: invoice,
    });
  } catch (error) {
    console.error("Invoice generation error:", error);
    res.status(500).json({
      success: false,
      message: "Invoice generation failed",
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
    const { invoiceNumber } = req.params;
    const pointsToRedeem = Number(req.body?.pointsToRedeem || 0);

    if (!pointsToRedeem || pointsToRedeem <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid points amount.",
      });
    }

    const invoice = await Invoice.findOne({ invoiceNumber });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    if (invoice.status === "Paid") {
      return res.status(400).json({
        success: false,
        message: "Cannot adjust EK points after invoice is paid.",
      });
    }

    const customer = await Customer.findOne({ ekonId: invoice.customerEkonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    if (Number(customer.pointsBalance || 0) < 500) {
      return res.status(400).json({
        success: false,
        message: "Customer must have at least 500 EK points to redeem.",
      });
    }

    if (pointsToRedeem > Number(customer.pointsBalance || 0)) {
      return res.status(400).json({
        success: false,
        message: "Customer does not have enough EK points.",
      });
    }

    const currentFinalTotal = Number(invoice.finalTotal || 0);
    const redeemAmount = Math.min(pointsToRedeem, currentFinalTotal);

    invoice.pointsRedeemed = Number(invoice.pointsRedeemed || 0) + redeemAmount;
    invoice.finalTotal = calculateInvoiceFinalTotal({
  subtotal: invoice.subtotal,
  customsDuty: invoice.customsDuty,
  gct: invoice.gct,
  processingFee: invoice.processingFee,
  deliveryFee: invoice.deliveryFee,
  otherAdjustment: invoice.otherAdjustment,
  pointsRedeemed: invoice.pointsRedeemed,
});

    customer.pointsBalance = Number(customer.pointsBalance || 0) - redeemAmount;
    customer.lastActivityDate = getJamaicaDateString();

    await invoice.save();
    await customer.save();

    await createRedemptionHistory({ customer, invoice, redeemAmount });

    await createCustomerNotification({
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      title: "EK Points Applied to Invoice",
      message: `JMD ${redeemAmount.toLocaleString()} in EK Points was applied to invoice ${invoice.invoiceNumber}. New balance: JMD ${Number(invoice.finalTotal || 0).toLocaleString()}.`,
      type: "Invoice Update",
      referenceType: "Invoice",
      referenceId: invoice.invoiceNumber,
    });

    await writeAuditLog({
      req,
      action: "APPLY_EK_POINTS_TO_INVOICE",
      module: "Invoices",
      description: `EK Points applied to invoice ${invoice.invoiceNumber}`,
      targetType: "Invoice",
      targetId: invoice.invoiceNumber,
      metadata: {
        customerEkonId: customer.ekonId,
        redeemAmount,
        finalTotal: invoice.finalTotal,
      },
    });

    res.json({
      success: true,
      message: "EK points applied successfully.",
      data: invoice,
      customer,
    });
  } catch (error) {
    console.error("Error applying invoice points:", error);
    res.status(500).json({
      success: false,
      message: "Could not apply EK points.",
      error: error.message,
    });
  }
};

const updateInvoiceChargesAdjustment = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    const invoice = await Invoice.findOne({ invoiceNumber });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    if (invoice.status === "Paid") {
      return res.status(400).json({
        success: false,
        message: "Cannot adjust charges after invoice is paid.",
      });
    }

    const invoiceCharges = getInvoiceChargesFromBody(req.body);

    invoice.customsDuty = invoiceCharges.customsDuty;
    invoice.gct = invoiceCharges.gct;
    invoice.processingFee = invoiceCharges.processingFee;
    invoice.deliveryFee = invoiceCharges.deliveryFee;
    invoice.deliveryType = invoiceCharges.deliveryType;
    invoice.otherAdjustment = invoiceCharges.otherAdjustment;
    invoice.adjustmentNote = invoiceCharges.adjustmentNote;

    invoice.finalTotal = calculateInvoiceFinalTotal({
  subtotal: invoice.subtotal,
  customsDuty: invoice.customsDuty,
  gct: invoice.gct,
  processingFee: invoice.processingFee,
  deliveryFee: invoice.deliveryFee,
  otherAdjustment: invoice.otherAdjustment,
  pointsRedeemed: invoice.pointsRedeemed,
});

    await invoice.save();

    await createCustomerNotification({
      customerEkonId: invoice.customerEkonId,
      customerName: invoice.customerName,
      title: "Invoice Charges Updated",
      message: `Invoice ${invoice.invoiceNumber} was updated. New balance: JMD ${Number(invoice.finalTotal || 0).toLocaleString()}.`,
      type: "Invoice Update",
      referenceType: "Invoice",
      referenceId: invoice.invoiceNumber,
    });

    await writeAuditLog({
      req,
      action: "UPDATE_INVOICE_CHARGES",
      module: "Invoices",
      description: `Invoice charges updated for ${invoice.invoiceNumber}`,
      targetType: "Invoice",
      targetId: invoice.invoiceNumber,
      metadata: {
        customsDuty: invoice.customsDuty,
        gct: invoice.gct,
        processingFee: invoice.processingFee,
        otherAdjustment: invoice.otherAdjustment,
        adjustmentNote: invoice.adjustmentNote,
        finalTotal: invoice.finalTotal,
      },
    });

    res.json({
      success: true,
      message: "Invoice charges updated successfully.",
      data: invoice,
    });
  } catch (error) {
    console.error("Error updating invoice charges:", error);
    res.status(500).json({
      success: false,
      message: "Could not update invoice charges.",
      error: error.message,
    });
  }
};

const markInvoicePaid = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const {
  receivingAccountNumber,
  paymentMethod = "Cash",
  amountTendered,
} = req.body;

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

    const invoiceTotal = roundMoney(invoice.finalTotal || 0);

const tenderedAmountValue =
  amountTendered !== undefined && amountTendered !== ""
    ? roundMoney(amountTendered)
    : invoiceTotal;

if (tenderedAmountValue < invoiceTotal) {
  return res.status(400).json({
    success: false,
    message: "Amount tendered cannot be less than invoice total.",
  });
}

const changeGiven = roundMoney(
  tenderedAmountValue - invoiceTotal
);

    const now = new Date();

    invoice.status = "Paid";
    invoice.paidDate = getJamaicaDateString(now);
    invoice.paidAt = now;
    invoice.paymentMethod = paymentMethod;
    invoice.amountTendered = tenderedAmountValue;
    invoice.changeGiven = changeGiven;
    invoice.paidIntoAccountNumber = account.accountNumber;
    invoice.paidIntoAccountName = account.accountName;
    invoice.cashierName =
  req.user?.fullName || req.user?.name || req.user?.email || "System User";
    await invoice.save();

    await AccountTransaction.create({
  transactionNumber: `TRN-${Date.now()}`,
  accountNumber: account.accountNumber,
  accountName: account.accountName,
  linkedChartAccountCode:
    account.linkedChartAccountCode || "",
  journalEntryNumber: invoice.invoiceNumber,
  ledgerReference: invoice.invoiceNumber,
  transactionType: "Invoice Payment",
  amount: invoiceTotal,
paymentMethod,
amountTendered: tenderedAmountValue,
changeGiven,
  reference: invoice.invoiceNumber,
  notes: `Invoice payment received for ${invoice.customerName}`,
  transactionDate: now,
});

await syncFinancialAccountFromLedger(account);

    const accountsReceivableAccount =
  await ChartOfAccount.findOne({
    accountCode: "1100",
  });

const cashAccount =
  await ChartOfAccount.findOne({
    accountCode:
      account.linkedChartAccountCode ||
      SYSTEM_ACCOUNTS.CASH_ON_HAND,
  });

  await ensureSystemAccounts();

if (
  accountsReceivableAccount &&
  cashAccount
) {
  await postJournalEntry({
    entryDate: getJamaicaDateString(),
    memo: `Invoice payment received from ${invoice.customerName}`,
    reference: invoice.invoiceNumber,
    sourceModule: "Invoices",
    createdBy: req.user?.name || "System User",
    lines: [
      {
        accountCode: cashAccount.accountCode,
        accountName: cashAccount.accountName,
        debit: Number(invoice.finalTotal || 0),
        credit: 0,
        description:
          "Cash received from customer",
      },
      {
        accountCode:
          accountsReceivableAccount.accountCode,
        accountName:
          accountsReceivableAccount.accountName,
        debit: 0,
        credit: Number(invoice.finalTotal || 0),
        description:
          "Customer receivable cleared",
      },
    ],
  });
}
    const trackingNumbers = (invoice.packages || []).map((pkg) => pkg.trackingNumber);

    await Package.updateMany(
  { trackingNumber: { $in: trackingNumbers } },
  {
    $set: {
      status: "Delivered",
      readyForPickup: false,
      readyForPickupDate: null,
      invoiceStatus: "Paid",
      statusUpdatedAt: now,
    },
  }
);

    await createCustomerNotification({
      customerEkonId: invoice.customerEkonId,
      customerName: invoice.customerName,
      title: "Invoice Paid Successfully",
      message: `Your invoice ${invoice.invoiceNumber} has been marked as paid. Amount received: JMD ${Number(invoice.finalTotal || 0).toLocaleString()}.`,
      type: "Invoice Update",
      referenceType: "Invoice",
      referenceId: invoice.invoiceNumber,
    });

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

const reconcilePaidInvoicePackages = async (req, res) => {
  try {
    const paidInvoices = await Invoice.find({ status: "Paid" });

    let updatedPackages = 0;

    for (const invoice of paidInvoices) {
      const trackingNumbers = (invoice.packages || [])
        .map((pkg) => pkg.trackingNumber)
        .filter(Boolean);

      if (trackingNumbers.length === 0) continue;

      const result = await Package.updateMany(
        { trackingNumber: { $in: trackingNumbers } },
        {
          $set: {
            status: "Delivered",
            readyForPickup: false,
            readyForPickupDate: null,
            invoiceStatus: "Paid",
            statusUpdatedAt: new Date(),
          },
        }
      );

      updatedPackages += result.modifiedCount || 0;
    }

    await writeAuditLog({
      req,
      action: "RECONCILE_PAID_INVOICE_PACKAGES",
      module: "Invoices",
      description: `Reconciled paid invoice packages and marked them delivered`,
      targetType: "Package",
      targetId: "PAID-INVOICE-RECONCILE",
      metadata: {
        paidInvoiceCount: paidInvoices.length,
        updatedPackages,
      },
    });

    res.json({
      success: true,
      message: "Paid invoice packages reconciled successfully.",
      paidInvoiceCount: paidInvoices.length,
      updatedPackages,
    });
  } catch (error) {
    console.error("Reconcile paid invoice packages error:", error);
    res.status(500).json({
      success: false,
      message: "Could not reconcile paid invoice packages.",
      error: error.message,
    });
  }
};

module.exports = {
  createInvoice,
  generateMultipleInvoice,
  getInvoices,
  updateInvoicePaymentLink,
  updateInvoiceChargesAdjustment,
  applyInvoicePointsAdjustment,
  markInvoicePaid,
  reconcilePaidInvoicePackages,
};