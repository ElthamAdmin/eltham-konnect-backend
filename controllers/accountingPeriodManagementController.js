const AccountingPeriod = require("../models/AccountingPeriod");
const { periodService } = require("../services/accountingEngine");
const respondError = (res, error, fallback) => {
  const status =
    error.code === 11000
      ? 409
      : error.name === "ValidationError"
        ? 400
        : [400, 404, 409].includes(error.statusCode)
          ? error.statusCode
          : 500;

  return res.status(status).json({
    success: false,
    message:
      error.code === 11000
        ? "This accounting period already exists."
        : status === 500
          ? fallback
          : error.message,
  });
};

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
    const { fiscalYear, periodMonth, notes = "" } = req.body;

    const year = Number(fiscalYear);
    const month = Number(periodMonth);

    if (
      !["string", "number"].includes(typeof fiscalYear) ||
      !["string", "number"].includes(typeof periodMonth) ||
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      typeof notes !== "string" ||
      notes.length > 2000
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a year from 2000 to 2100, a month from 1 to 12, and notes of no more than 2,000 characters.",
      });
    }

    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const startDate = `${prefix}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endDate = `${prefix}-${lastDay}`;

    const overlap = await AccountingPeriod.exists({
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });

    if (overlap) {
      return res.status(409).json({
        success: false,
        message: "An existing accounting period overlaps this month.",
      });
    }

    const monthName = new Intl.DateTimeFormat("en-US", {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${startDate}T00:00:00Z`));

    const period = await AccountingPeriod.create({
      periodNumber: `PER-${prefix}`,
      fiscalYear: year,
      periodMonth: month,
      periodName: `${monthName} ${year}`,
      startDate,
      endDate,
      status: "Open",
      allowPosting: true,
      notes: notes.trim(),
      controlHistory: [
        {
          action: "CREATE",
          at: new Date(),
          by:
            req.user?.fullName ||
            req.user?.name ||
            req.user?.email ||
            "System User",
          reason: notes.trim(),
          previousStatus: "",
          newStatus: "Open",
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: "Accounting period created successfully.",
      data: period,
    });
  } catch (error) {
    console.error("Create accounting period error:", error);
    return respondError(res, error, "Could not create accounting period.");
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
    return respondError(res, error, "Could not validate accounting period.");
  }
};

const getCloseChecklist = async (req, res) => {
  try {
    const { periodNumber } = req.params;

    const checklist = await periodService.buildCloseChecklist({
      periodNumber,
      user: req.user,
    });

    res.json({
      success: true,
      message: checklist.readyToClose
        ? "Period is ready to close."
        : "Period is not ready to close.",
      data: checklist,
    });
    } catch (error) {
    console.error("Close checklist error:", error);
    return respondError(res, error, "Could not build close checklist.");
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
    return respondError(res, error, "Could not close accounting period.");
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
    return respondError(res, error, "Could not lock accounting period.");
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
    return respondError(res, error, "Could not reopen accounting period.");
  }
};

module.exports = {
  getAccountingPeriods,
  getCurrentAccountingPeriod,
  createAccountingPeriod,
  validateAccountingPeriod,
  getCloseChecklist,
  closeAccountingManagementPeriod,
  lockAccountingPeriod,
  reopenAccountingPeriod,
};