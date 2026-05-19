const POSCashDrawer = require("../models/POSCashDrawer");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getOpenDrawer = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || "";

    const drawer = await POSCashDrawer.findOne({
      openedByUserId: userId,
      status: "Open",
    }).sort({ openedAt: -1 });

    res.json({
      success: true,
      data: drawer,
    });
  } catch (error) {
    console.error("POS drawer load error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load open POS drawer",
      error: error.message,
    });
  }
};

const openDrawer = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || "";
    const userName = req.user?.fullName || req.user?.name || "System User";

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
      openedByName: userName,
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
    console.error("POS drawer open error:", error);
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
    const userId = req.user?.userId || req.user?._id || "";

    const drawer = await POSCashDrawer.findOne({
      openedByUserId: userId,
      status: "Open",
    });

    if (!drawer) {
      return res.status(400).json({
        success: false,
        message: "No open POS cash drawer found. Open drawer before taking payment.",
      });
    }

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

    res.json({
      success: true,
      message: "POS drawer sale recorded successfully",
      data: drawer,
    });
  } catch (error) {
    console.error("POS drawer sale error:", error);
    res.status(500).json({
      success: false,
      message: "Could not record POS drawer sale",
      error: error.message,
    });
  }
};

const closeDrawer = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || "";
    const closingCashCount = roundMoney(req.body.closingCashCount);

    const drawer = await POSCashDrawer.findOne({
      openedByUserId: userId,
      status: "Open",
    });

    if (!drawer) {
      return res.status(400).json({
        success: false,
        message: "No open POS cash drawer found.",
      });
    }

    drawer.closingCashCount = closingCashCount;
    drawer.cashVariance = roundMoney(closingCashCount - Number(drawer.expectedCash || 0));
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
    console.error("POS drawer close error:", error);
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

    res.json({
      success: true,
      data: drawers,
    });
  } catch (error) {
    console.error("POS drawer history error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load POS drawer history",
      error: error.message,
    });
  }
};

module.exports = {
  getOpenDrawer,
  openDrawer,
  recordDrawerSale,
  closeDrawer,
  getDrawerHistory,
};