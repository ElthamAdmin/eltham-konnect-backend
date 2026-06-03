const POSCashDrawer = require("../models/POSCashDrawer");
const POSTransaction = require("../models/POSTransaction");
const Invoice = require("../models/Invoice");
const MarketplaceInvoice = require("../models/MarketplaceInvoice");
const Package = require("../models/Package");
const POSActionLog = require("../models/POSActionLog");
const POSShiftHandover = require("../models/POSShiftHandover");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const ChartOfAccount = require("../models/ChartOfAccount");
const JournalEntry = require("../models/JournalEntry");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");


const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getUserId = (req) => req.user?.userId || req.user?._id || "";

const getUserName = (req) =>
  req.user?.fullName || req.user?.name || req.user?.email || "System User";

const getUserBranch = (req) => req.user?.branch || "Eltham Park Mainstore";

const getDateString = () => {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;

  return `${year}-${month}-${day}`;
};

const applyChartBalance = (account, debit, credit) => {
  const debitAmount = Number(debit || 0);
  const creditAmount = Number(credit || 0);

  if (account.normalBalance === "Debit") {
    account.currentBalance =
      Number(account.currentBalance || 0) + debitAmount - creditAmount;
  } else {
    account.currentBalance =
      Number(account.currentBalance || 0) + creditAmount - debitAmount;
  }
};

const getRunningBalance = async (accountCode, normalBalance, debit, credit) => {
  const lastLedger = await GeneralLedgerTransaction.findOne({ accountCode })
    .sort({ createdAt: -1, _id: -1 });

  const previous = Number(lastLedger?.runningBalance || 0);

  if (normalBalance === "Debit") {
    return roundMoney(previous + Number(debit || 0) - Number(credit || 0));
  }

  return roundMoney(previous + Number(credit || 0) - Number(debit || 0));
};

const getOrCreateAssetChartAccount = async (financialAccount) => {
  const accountCode =
    financialAccount.linkedChartAccountCode ||
    `1000-${String(financialAccount.accountNumber).replace(/[^a-zA-Z0-9]/g, "")}`;

  let account = await ChartOfAccount.findOne({ accountCode });

  if (!account) {
    account = await ChartOfAccount.create({
      accountCode,
      accountName: financialAccount.accountName,
      accountCategory: "Asset",
      accountType: financialAccount.accountType,
      normalBalance: "Debit",
      description: "Auto-created from POS receiving account",
      isSystemAccount: true,
      allowManualEntries: false,
      status: "Active",
    });
  }

  return account;
};

const getOrCreateRevenueChartAccount = async (invoiceType) => {
  const accountCode = invoiceType === "Marketplace" ? "4105" : "4100";
  const accountName =
    invoiceType === "Marketplace"
      ? "Marketplace Sales Income"
      : "Shipping Sales Income";

  let account = await ChartOfAccount.findOne({ accountCode });

  if (!account) {
    account = await ChartOfAccount.create({
      accountCode,
      accountName,
      accountCategory: "Revenue",
      accountType: "Sales Income",
      normalBalance: "Credit",
      description: "Auto-created POS revenue account",
      isSystemAccount: true,
      allowManualEntries: false,
      status: "Active",
    });
  }

  return account;
};

const updateDrawerTotals = async ({ drawer, paymentMethod, amount }) => {
  const saleAmount = roundMoney(amount);

  if (paymentMethod === "Cash") {
    drawer.totalCashSales += saleAmount;
    drawer.expectedCash += saleAmount;
  } else if (paymentMethod === "Card") {
    drawer.totalCardSales += saleAmount;
  } else if (paymentMethod === "Bank Transfer") {
    drawer.totalTransferSales += saleAmount;
  } else {
    drawer.totalOtherSales += saleAmount;
  }

  drawer.totalSales =
    Number(drawer.totalCashSales || 0) +
    Number(drawer.totalCardSales || 0) +
    Number(drawer.totalTransferSales || 0) +
    Number(drawer.totalOtherSales || 0);

  await drawer.save();
};

const getOpenDrawer = async (req, res) => {
  try {
    const drawer = await POSCashDrawer.findOne({
      openedByUserId: getUserId(req),
branch: getUserBranch(req),
status: "Open",
    }).sort({ openedAt: -1 });

    res.json({ success: true, data: drawer });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load open POS drawer",
      error: error.message,
    });
  }
};

const openDrawer = async (req, res) => {
  try {
    const userId = getUserId(req);

    const existingOpenDrawer = await POSCashDrawer.findOne({
      openedByUserId: userId,
branch: getUserBranch(req),
status: "Open",
    });

    if (existingOpenDrawer) {
      return res.status(400).json({
        success: false,
        message: "You already have an open cash drawer.",
      });
    }

    const openingFloat = roundMoney(req.body.openingFloat);

    const drawer = await POSCashDrawer.create({
      drawerNumber: `DRAWER-${Date.now()}`,
      openedByUserId: userId,
      openedByName: getUserName(req),
      branch: getUserBranch(req),
      openingFloat,
      expectedCash: openingFloat,
      status: "Open",
      openedAt: new Date(),
      notes: req.body.notes || "",
    });

    res.status(201).json({
      success: true,
      message: "POS cash drawer opened successfully",
      data: drawer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not open POS cash drawer",
      error: error.message,
    });
  }
};

const recordDrawerSale = async (req, res) => {
  try {
    const { paymentMethod, amount } = req.body;

    const drawer = await POSCashDrawer.findOne({
      openedByUserId: getUserId(req),
branch: getUserBranch(req),
status: "Open",
    });

    if (!drawer) {
      return res.status(400).json({
        success: false,
        message: "No open POS cash drawer found. Open drawer before taking payment.",
      });
    }

    await updateDrawerTotals({ drawer, paymentMethod, amount });

    res.json({
      success: true,
      message: "POS drawer sale recorded successfully",
      data: drawer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not record POS drawer sale",
      error: error.message,
    });
  }
};

const findInvoiceForPOS = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;

    const shippingInvoice = await Invoice.findOne({ invoiceNumber });

    if (shippingInvoice) {
      return res.json({
        success: true,
        data: {
          invoiceType: "Shipping",
          invoice: shippingInvoice,
        },
      });
    }

    const marketplaceInvoice = await MarketplaceInvoice.findOne({
      invoiceNumber,
    });

    if (marketplaceInvoice) {
      return res.json({
        success: true,
        data: {
          invoiceType: "Marketplace",
          invoice: marketplaceInvoice,
        },
      });
    }

    res.status(404).json({
      success: false,
      message: "No shipping or marketplace invoice found with that invoice number.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not find invoice",
      error: error.message,
    });
  }
};

const cashOutInvoice = async (req, res) => {
  try {
    const {
      invoiceType,
      invoiceNumber,
      paymentMethod,
      amountTendered,
      paidIntoAccountNumber,
      paidIntoAccountName,
      notes,
    } = req.body;

    if (!paidIntoAccountNumber) {
  return res.status(400).json({
    success: false,
    message: "Please select the financial account that received this payment.",
  });
}

const receivingAccount = await FinancialAccount.findOne({
  accountNumber: paidIntoAccountNumber,
  status: "Active",
});

if (!receivingAccount) {
  return res.status(404).json({
    success: false,
    message: "Selected financial account was not found or is inactive.",
  });
}

    if (!invoiceType || !invoiceNumber) {
      return res.status(400).json({
        success: false,
        message: "Invoice type and invoice number are required.",
      });
    }

    const drawer = await POSCashDrawer.findOne({
      openedByUserId: getUserId(req),
branch: getUserBranch(req),
status: "Open",
    });

    if (!drawer) {
      return res.status(400).json({
        success: false,
        message: "Open a POS cash drawer before cashing out an invoice.",
      });
    }

    const Model = invoiceType === "Marketplace" ? MarketplaceInvoice : Invoice;
    const invoice = await Model.findOne({ invoiceNumber });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: `${invoiceType} invoice not found.`,
      });
    }

    if (invoice.status === "Paid") {
      return res.status(400).json({
        success: false,
        message: "This invoice is already paid.",
      });
    }

    const finalTotal = roundMoney(invoice.finalTotal);
    const tendered = roundMoney(amountTendered || finalTotal);
    const changeGiven =
      paymentMethod === "Cash" ? roundMoney(Math.max(tendered - finalTotal, 0)) : 0;

    if (paymentMethod === "Cash" && tendered < finalTotal) {
      return res.status(400).json({
        success: false,
        message: "Amount tendered cannot be less than the invoice total.",
      });
    }

    invoice.status = "Paid";
    invoice.paidAt = new Date();

    if (invoiceType === "Shipping") {
      invoice.paidDate = new Date().toISOString().split("T")[0];
      invoice.paymentMethod = paymentMethod;
      invoice.amountTendered = tendered;
      invoice.changeGiven = changeGiven;
      invoice.paidIntoAccountNumber = paidIntoAccountNumber || "";
      invoice.paidIntoAccountName = paidIntoAccountName || "";
      invoice.cashierName = getUserName(req);
    }

    await invoice.save();

if (invoiceType === "Shipping") {
  const trackingNumbers = (invoice.packages || [])
    .map((pkg) => pkg.trackingNumber)
    .filter(Boolean);

  if (trackingNumbers.length > 0) {
    await Package.updateMany(
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
  }
}

await updateDrawerTotals({
  drawer,
  paymentMethod,
  amount: finalTotal,
});

    receivingAccount.currentBalance = roundMoney(
  Number(receivingAccount.currentBalance || 0) + finalTotal
);

receivingAccount.baseCurrencyBalance = roundMoney(
  Number(receivingAccount.baseCurrencyBalance || 0) +
    finalTotal * Number(receivingAccount.exchangeRate || 1)
);

await receivingAccount.save();

const assetAccount = await getOrCreateAssetChartAccount(receivingAccount);
const revenueAccount = await getOrCreateRevenueChartAccount(invoiceType);

applyChartBalance(assetAccount, finalTotal, 0);
applyChartBalance(revenueAccount, 0, finalTotal);

await assetAccount.save();
await revenueAccount.save();

const entryNumber = `JE-POS-${Date.now()}`;
const entryDate = getDateString();
const reference = `${invoiceType} invoice ${invoiceNumber}`;

const journalEntry = await JournalEntry.create({
  entryNumber,
  entryDate,
  reference,
  sourceModule: "POS",
  memo: `POS payment received for ${reference}`,
  totalDebit: finalTotal,
  totalCredit: finalTotal,
  status: "Posted",
  createdBy: getUserName(req),
  lines: [
    {
      accountCode: assetAccount.accountCode,
      accountName: assetAccount.accountName,
      debit: finalTotal,
      credit: 0,
      description: `Payment received into ${receivingAccount.accountName}`,
    },
    {
      accountCode: revenueAccount.accountCode,
      accountName: revenueAccount.accountName,
      debit: 0,
      credit: finalTotal,
      description: `${invoiceType} revenue from POS`,
    },
  ],
});

const assetRunningBalance = await getRunningBalance(
  assetAccount.accountCode,
  assetAccount.normalBalance,
  finalTotal,
  0
);

const revenueRunningBalance = await getRunningBalance(
  revenueAccount.accountCode,
  revenueAccount.normalBalance,
  0,
  finalTotal
);

const assetLedger = await GeneralLedgerTransaction.create({
  ledgerNumber: `GL-POS-${Date.now()}-DR`,
  entryNumber,
  entryDate,
  accountCode: assetAccount.accountCode,
  accountName: assetAccount.accountName,
  accountCategory: assetAccount.accountCategory,
  normalBalance: assetAccount.normalBalance,
  debit: finalTotal,
  credit: 0,
  runningBalance: assetRunningBalance,
  reference,
  sourceModule: "POS",
  memo: journalEntry.memo,
  description: `POS payment received into ${receivingAccount.accountName}`,
});

const revenueLedger = await GeneralLedgerTransaction.create({
  ledgerNumber: `GL-POS-${Date.now()}-CR`,
  entryNumber,
  entryDate,
  accountCode: revenueAccount.accountCode,
  accountName: revenueAccount.accountName,
  accountCategory: revenueAccount.accountCategory,
  normalBalance: revenueAccount.normalBalance,
  debit: 0,
  credit: finalTotal,
  runningBalance: revenueRunningBalance,
  reference,
  sourceModule: "POS",
  memo: journalEntry.memo,
  description: `${invoiceType} POS revenue`,
});

const financeTransaction = await AccountTransaction.create({
  transactionNumber: `TRN-POS-${Date.now()}`,
  accountNumber: receivingAccount.accountNumber,
  accountName: receivingAccount.accountName,
  linkedChartAccountCode: assetAccount.accountCode,
  journalEntryNumber: entryNumber,
  ledgerReference: `${assetLedger.ledgerNumber}, ${revenueLedger.ledgerNumber}`,
  transactionType: "Invoice Payment",
  amount: finalTotal,
  paymentMethod,
  amountTendered: tendered,
  changeGiven,
  reference,
  notes:
    notes ||
    `POS cashout by ${getUserName(req)} at ${getUserBranch(req)} using ${paymentMethod}`,
  transactionDate: new Date(),
});

    const transaction = await POSTransaction.create({
      transactionNumber: `POS-${Date.now()}`,
      invoiceType,
      invoiceNumber,
      customerName: invoice.customerName || "",
      customerEkonId: invoice.customerEkonId || invoice.customerKey || "",
      amountPaid: finalTotal,
      amountTendered: tendered,
      changeGiven,
      paymentMethod,
      paidIntoAccountNumber: paidIntoAccountNumber || "",
      paidIntoAccountName: paidIntoAccountName || "",
      cashierUserId: getUserId(req),
      cashierName: getUserName(req),
      branch: getUserBranch(req),
      drawerNumber: drawer.drawerNumber,
      notes: notes || "",
    });

    res.json({
      success: true,
      message: `${invoiceType} invoice cashed out successfully.`,
      data: {
  invoice,
  drawer,
  transaction,
  financeTransaction,
  receivingAccount,
  journalEntry,
  ledgers: [assetLedger, revenueLedger],
},
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not cash out invoice",
      error: error.message,
    });
  }
};

const closeDrawer = async (req, res) => {
  try {
    const closingCashCount = roundMoney(req.body.closingCashCount);

    const drawer = await POSCashDrawer.findOne({
      openedByUserId: getUserId(req),
branch: getUserBranch(req),
status: "Open",
    });

    if (!drawer) {
      return res.status(400).json({
        success: false,
        message: "No open POS cash drawer found.",
      });
    }

    drawer.closingCashCount = closingCashCount;
    drawer.cashVariance = roundMoney(
      closingCashCount - Number(drawer.expectedCash || 0)
    );
    drawer.status = "Closed";
    drawer.closedAt = new Date();
    drawer.notes = req.body.notes || drawer.notes;

    await drawer.save();

    res.json({
      success: true,
      message: "POS cash drawer closed successfully",
      data: drawer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not close POS cash drawer",
      error: error.message,
    });
  }
};

const getDrawerHistory = async (req, res) => {
  try {
    const drawers = await POSCashDrawer.find({
      branch: getUserBranch(req),
    })
      .sort({ openedAt: -1 })
      .limit(100);

    res.json({ success: true, data: drawers });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load POS drawer history",
      error: error.message,
    });
  }
};

const getPOSTransactions = async (req, res) => {
  try {
    const transactions = await POSTransaction.find({
      branch: getUserBranch(req),
    })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load POS transactions",
      error: error.message,
    });
  }
};

const getPOSAnalytics = async (req, res) => {
  try {
    const branch = getUserBranch(req);

    const transactions = await POSTransaction.find({ branch });
    const drawers = await POSCashDrawer.find({ branch });

    const totals = transactions.reduce(
      (summary, item) => {
        summary.totalSales += Number(item.amountPaid || 0);
        summary.transactionCount += 1;
        summary.byMethod[item.paymentMethod] =
          (summary.byMethod[item.paymentMethod] || 0) +
          Number(item.amountPaid || 0);
        summary.byCashier[item.cashierName] =
          (summary.byCashier[item.cashierName] || 0) +
          Number(item.amountPaid || 0);
        return summary;
      },
      {
        branch,
        totalSales: 0,
        transactionCount: 0,
        drawerCount: drawers.length,
        byMethod: {},
        byCashier: {},
      }
    );

    res.json({ success: true, data: totals });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load POS analytics",
      error: error.message,
    });
  }
};

const createShiftHandover = async (req, res) => {
  try {
    const drawer = await POSCashDrawer.findOne({
      openedByUserId: getUserId(req),
      branch: getUserBranch(req),
      status: "Open",
    });

    if (!drawer) {
      return res.status(400).json({
        success: false,
        message: "No open drawer found for shift handover.",
      });
    }

    const countedCash = roundMoney(req.body.countedCash);

    const handover = await POSShiftHandover.create({
      drawerNumber: drawer.drawerNumber,
      branch: drawer.branch,
      fromCashierUserId: getUserId(req),
      fromCashierName: getUserName(req),
      toCashierName: req.body.toCashierName || "",
      expectedCash: drawer.expectedCash,
      countedCash,
      variance: roundMoney(countedCash - Number(drawer.expectedCash || 0)),
      notes: req.body.notes || "",
    });

    res.status(201).json({
      success: true,
      message: "Shift handover recorded successfully",
      data: handover,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not record shift handover",
      error: error.message,
    });
  }
};

const createPOSActionLog = async (req, res) => {
  try {
    const log = await POSActionLog.create({
      actionType: req.body.actionType,
      invoiceNumber: req.body.invoiceNumber || "",
      invoiceType: req.body.invoiceType || "",
      reason: req.body.reason || "",
      amount: roundMoney(req.body.amount),
      branch: getUserBranch(req),
      cashierUserId: getUserId(req),
      cashierName: getUserName(req),
      approvedByUserId: getUserId(req),
      approvedByName: getUserName(req),
    });

    res.status(201).json({
      success: true,
      message: `${req.body.actionType} logged successfully`,
      data: log,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not log POS action",
      error: error.message,
    });
  }
};

const getReceiptData = async (req, res) => {
  try {
    const transaction = await POSTransaction.findOne({
      transactionNumber: req.params.transactionNumber,
      branch: getUserBranch(req),
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Receipt transaction not found.",
      });
    }

    res.json({
      success: true,
      data: {
        businessName: "Eltham Konnect",
        branch: transaction.branch,
        transaction,
        printedAt: new Date(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load receipt data",
      error: error.message,
    });
  }
};

module.exports = {
  getOpenDrawer,
  openDrawer,
  recordDrawerSale,
  findInvoiceForPOS,
  cashOutInvoice,
  closeDrawer,
  getDrawerHistory,
  getPOSTransactions,
  getPOSAnalytics,
createShiftHandover,
createPOSActionLog,
getReceiptData,
};