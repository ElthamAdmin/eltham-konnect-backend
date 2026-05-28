const POSCashDrawer = require("../models/POSCashDrawer");
const POSTransaction = require("../models/POSTransaction");
const Invoice = require("../models/Invoice");
const MarketplaceInvoice = require("../models/MarketplaceInvoice");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getUserId = (req) => req.user?.userId || req.user?._id || "";

const getUserName = (req) =>
  req.user?.fullName || req.user?.name || req.user?.email || "System User";

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
    const drawers = await POSCashDrawer.find().sort({ openedAt: -1 }).limit(100);
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
    const transactions = await POSTransaction.find()
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

module.exports = {
  getOpenDrawer,
  openDrawer,
  recordDrawerSale,
  findInvoiceForPOS,
  cashOutInvoice,
  closeDrawer,
  getDrawerHistory,
  getPOSTransactions,
};