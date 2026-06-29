const AccountingPeriod = require("../models/AccountingPeriod");
const { periodService } = require("../services/accountingEngine");

const getAccountingPeriods = async (req, res) => {
  try {
    const periods = await AccountingPeriod.find().sort({
      fiscalYear: -1,
      periodMonth: -1,
    });

    res.json({ success: true, data: periods });
  } catch (error) {
    console.error("Accounting periods error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load accounting periods",
      error: error.message,
    });
  }
};

const getCurrentAccountingPeriod = async (req, res) => {
  try {
    const period = await periodService.getCurrentPeriod();

    res.json({
      success: true,
      data: period,
    });
  } catch (error) {
    console.error("Current accounting period error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load current accounting period",
      error: error.message,
    });
  }
};

const createAccountingPeriod = async (req, res) => {
  try {
    const { fiscalYear, periodMonth, startDate, endDate, notes } = req.body;

    if (!fiscalYear || !periodMonth || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Fiscal year, period month, start date, and end date are required.",
      });
    }

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
      allowPosting: true,
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

const validateAccountingPeriod = async (req, res) => {
  try {
    const { periodNumber } = req.params;

    const validation = await periodService.validatePeriod({ periodNumber });

    res.json({
      success: true,
      message: validation.passed
        ? "Accounting period validation passed."
        : "Accounting period validation failed.",
      data: validation,
    });
  } catch (error) {
    console.error("Validate accounting period error:", error);
    res.status(500).json({
      success: false,
      message: "Could not validate accounting period",
      error: error.message,
    });
  }
};

const closeAccountingManagementPeriod = async (req, res) => {
  try {
    const { periodNumber } = req.params;
    const { notes = "" } = req.body;

    const period = await periodService.closePeriod({
      periodNumber,
      notes,
      user: req.user,
    });

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
    const { notes = "" } = req.body;

    const period = await periodService.lockPeriod({
      periodNumber,
      notes,
      user: req.user,
    });

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

const reopenAccountingPeriod = async (req, res) => {
  try {
    const { periodNumber } = req.params;
    const { reason = "" } = req.body;

    const period = await periodService.reopenPeriod({
      periodNumber,
      reason,
      user: req.user,
    });

    res.json({
      success: true,
      message: "Accounting period reopened successfully",
      data: period,
    });
  } catch (error) {
    console.error("Reopen accounting period error:", error);
    res.status(500).json({
      success: false,
      message: "Could not reopen accounting period",
      error: error.message,
    });
  }
};

module.exports = {
  getAccountingPeriods,
  getCurrentAccountingPeriod,
  createAccountingPeriod,
  validateAccountingPeriod,
  closeAccountingManagementPeriod,
  lockAccountingPeriod,
  reopenAccountingPeriod,
};