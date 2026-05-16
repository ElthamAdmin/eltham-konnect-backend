const AccountingPeriod = require("../models/AccountingPeriod");

const getAccountingPeriods = async (req, res) => {
  try {
    const periods = await AccountingPeriod.find().sort({
      fiscalYear: -1,
      periodMonth: -1,
    });

    res.json({
      success: true,
      data: periods,
    });
  } catch (error) {
    console.error("Accounting periods error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load accounting periods",
      error: error.message,
    });
  }
};

const createAccountingPeriod = async (req, res) => {
  try {
    const { fiscalYear, periodMonth, startDate, endDate, notes } = req.body;

    const monthName = new Date(Number(fiscalYear), Number(periodMonth) - 1, 1)
      .toLocaleString("en-US", { month: "long" });

    const existing = await AccountingPeriod.findOne({
      fiscalYear: Number(fiscalYear),
      periodMonth: Number(periodMonth),
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "This accounting period already exists.",
      });
    }

    const period = await AccountingPeriod.create({
      periodNumber: `PER-${fiscalYear}-${String(periodMonth).padStart(2, "0")}`,
      fiscalYear: Number(fiscalYear),
      periodMonth: Number(periodMonth),
      periodName: `${monthName} ${fiscalYear}`,
      startDate,
      endDate,
      status: "Open",
      notes,
    });

    res.status(201).json({
      success: true,
      message: "Accounting period created successfully",
      data: period,
    });
  } catch (error) {
    console.error("Create accounting period error:", error);
    res.status(500).json({
      success: false,
      message: "Could not create accounting period",
      error: error.message,
    });
  }
};

const closeAccountingManagementPeriod = async (req, res) => {
  try {
    const { periodNumber } = req.params;

    const period = await AccountingPeriod.findOne({ periodNumber });

    if (!period) {
      return res.status(404).json({
        success: false,
        message: "Accounting period not found",
      });
    }

    if (period.status === "Locked") {
      return res.status(400).json({
        success: false,
        message: "Locked periods cannot be changed.",
      });
    }

    period.status = "Closed";
    period.closedAt = new Date();
    period.closedBy = req.user?.name || req.user?.fullName || "System User";

    await period.save();

    res.json({
      success: true,
      message: "Accounting period closed successfully",
      data: period,
    });
  } catch (error) {
    console.error("Close accounting period error:", error);
    res.status(500).json({
      success: false,
      message: "Could not close accounting period",
      error: error.message,
    });
  }
};

const lockAccountingPeriod = async (req, res) => {
  try {
    const { periodNumber } = req.params;

    const period = await AccountingPeriod.findOne({ periodNumber });

    if (!period) {
      return res.status(404).json({
        success: false,
        message: "Accounting period not found",
      });
    }

    period.status = "Locked";
    period.lockedAt = new Date();
    period.lockedBy = req.user?.name || req.user?.fullName || "System User";

    await period.save();

    res.json({
      success: true,
      message: "Accounting period locked successfully",
      data: period,
    });
  } catch (error) {
    console.error("Lock accounting period error:", error);
    res.status(500).json({
      success: false,
      message: "Could not lock accounting period",
      error: error.message,
    });
  }
};

module.exports = {
  getAccountingPeriods,
  createAccountingPeriod,
  closeAccountingManagementPeriod,
  lockAccountingPeriod,
};