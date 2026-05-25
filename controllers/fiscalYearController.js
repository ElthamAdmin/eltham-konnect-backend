const FiscalYear = require("../models/FiscalYear");
const AccountingPeriod = require("../models/AccountingPeriod");

const getFiscalYears = async (req, res) => {
  try {
    const years = await FiscalYear.find().sort({
      fiscalYear: -1,
    });

    res.json({
      success: true,
      data: years,
    });
  } catch (error) {
    console.error("Get fiscal years error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load fiscal years",
      error: error.message,
    });
  }
};

const createFiscalYear = async (req, res) => {
  try {
    const {
      fiscalYear,
      startDate,
      endDate,
      totalPeriods,
      notes,
    } = req.body;

    const existing = await FiscalYear.findOne({
      fiscalYear,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Fiscal year already exists",
      });
    }

    const currentYear = await FiscalYear.findOne({
      isCurrentYear: true,
    });

    if (req.body.isCurrentYear === true) {
  await FiscalYear.updateMany(
    {},
    {
      isCurrentYear: false,
    }
  );
}

    if (!currentYear) {
      req.body.isCurrentYear = true;
    }

    const year = await FiscalYear.create({
      fiscalYear,
      yearName: `FY ${fiscalYear}`,
      startDate,
      endDate,
      totalPeriods: totalPeriods || 12,
      notes,
      createdBy: req.user?.name || "System User",
      isCurrentYear: !currentYear,
    });

    res.status(201).json({
      success: true,
      message: "Fiscal year created successfully",
      data: year,
    });
  } catch (error) {
    console.error("Create fiscal year error:", error);

    res.status(500).json({
      success: false,
      message: "Could not create fiscal year",
      error: error.message,
    });
  }
};

const closeFiscalYear = async (req, res) => {
  try {
    const { fiscalYear } = req.params;

    const year = await FiscalYear.findOne({
      fiscalYear,
    });

    if (year?.status === "Locked") {
  return res.status(400).json({
    success: false,
    message: "Locked fiscal years cannot be modified",
  });
}

    if (!year) {
      return res.status(404).json({
        success: false,
        message: "Fiscal year not found",
      });
    }

    const openPeriods = await AccountingPeriod.countDocuments({
      fiscalYear: Number(fiscalYear),
      status: "Open",
    });

    if (openPeriods > 0) {
      return res.status(400).json({
        success: false,
        message:
          "All accounting periods must be closed before closing fiscal year",
      });
    }

    year.status = "Closed";
    year.closedBy = req.user?.name || "System User";
    year.closedAt = new Date();

    await year.save();

    res.json({
      success: true,
      message: "Fiscal year closed successfully",
    });
  } catch (error) {
    console.error("Close fiscal year error:", error);

    res.status(500).json({
      success: false,
      message: "Could not close fiscal year",
      error: error.message,
    });
  }
};

const lockFiscalYear = async (req, res) => {
  try {
    const { fiscalYear } = req.params;

    const year = await FiscalYear.findOne({
      fiscalYear,
    });

    if (!year) {
      return res.status(404).json({
        success: false,
        message: "Fiscal year not found",
      });
    }

    if (year.status !== "Closed") {
      return res.status(400).json({
        success: false,
        message:
          "Fiscal year must be closed before locking",
      });
    }

    year.status = "Locked";
    year.lockedBy = req.user?.name || "System User";
    year.lockedAt = new Date();

    await year.save();

    res.json({
      success: true,
      message: "Fiscal year locked successfully",
    });
  } catch (error) {
    console.error("Lock fiscal year error:", error);

    res.status(500).json({
      success: false,
      message: "Could not lock fiscal year",
      error: error.message,
    });
  }
};

module.exports = {
  getFiscalYears,
  createFiscalYear,
  closeFiscalYear,
  lockFiscalYear,
};