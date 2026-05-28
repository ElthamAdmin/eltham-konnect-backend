const POSCashDrawer = require("../models/POSCashDrawer");
const POSTransaction = require("../models/POSTransaction");
const Invoice = require("../models/Invoice");
const MarketplaceInvoice = require("../models/MarketplaceInvoice");
const POSActionLog = require("../models/POSActionLog");
const POSShiftHandover = require("../models/POSShiftHandover");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getUserId = (req) => req.user?.userId || req.user?._id || "";

const getUserName = (req) =>
  req.user?.fullName || req.user?.name || req.user?.email || "System User";

const getUserBranch = (req) => req.user?.branch || "Eltham Park Mainstore";

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

    await updateDrawerTotals({
      drawer,
      paymentMethod,
      amount: finalTotal,
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