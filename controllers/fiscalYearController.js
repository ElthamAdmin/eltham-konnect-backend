const FiscalYear = require("../models/FiscalYear");

const fiscalYearService = require("../services/accountingEngine/fiscalYearService");
const yearEndService = require("../services/accountingEngine/yearEndService");

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
    const year = await fiscalYearService.createFiscalYear({
      fiscalYear: req.body.fiscalYear,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      totalPeriods: req.body.totalPeriods,
      notes: req.body.notes,
      isCurrentYear: req.body.isCurrentYear,
      user: req.user,
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

const validateFiscalYear = async (req, res) => {
  try {
    const validation = await fiscalYearService.validateFiscalYear({
      fiscalYear: req.params.fiscalYear,
      user: req.user,
        mode: req.query.mode || "progress",
    });

    res.json({
      success: true,
      message: validation.passed
        ? "Fiscal year validation passed."
        : "Fiscal year validation failed.",
      data: validation,
    });
  } catch (error) {
    console.error("Validate fiscal year error:", error);

    res.status(500).json({
      success: false,
      message: "Could not validate fiscal year",
      error: error.message,
    });
  }
};

const closeFiscalYear = async (req, res) => {
  try {
    const year = await fiscalYearService.closeFiscalYear({
      fiscalYear: req.params.fiscalYear,
      user: req.user,
    });

    res.json({
      success: true,
      message: "Fiscal year closed successfully",
      data: year,
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
    const year = await fiscalYearService.lockFiscalYear({
      fiscalYear: req.params.fiscalYear,
      user: req.user,
    });

    res.json({
      success: true,
      message: "Fiscal year locked successfully",
      data: year,
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

const createNextFiscalYear = async (req, res) => {
  try {
    const year = await fiscalYearService.createNextFiscalYear({
      fiscalYear: req.params.fiscalYear,
      user: req.user,
    });

    res.json({
      success: true,
      message: "Next fiscal year created successfully",
      data: year,
    });
  } catch (error) {
    console.error("Create next fiscal year error:", error);

    res.status(500).json({
      success: false,
      message: "Could not create next fiscal year",
      error: error.message,
    });
  }
};

const executeYearEndClose = async (req, res) => {
  try {
    const result = await yearEndService.executeYearEndClose({
      fiscalYear: req.params.fiscalYear,
      user: req.user,
    });

    res.json({
      success: true,
      message: "Year-end close completed successfully",
      data: result,
    });
  } catch (error) {
    console.error("Year-end close error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Could not execute year-end close",
      error: error.message,
    });
  }
};

const generateOpeningBalances = async (req, res) => {
  try {
    const result = await yearEndService.generateOpeningBalances({
      fiscalYear: req.params.fiscalYear,
      user: req.user,
    });

    res.json({
      success: true,
      message: "Opening balances generated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Generate opening balances error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Could not generate opening balances",
      error: error.message,
    });
  }
};

module.exports = {
  getFiscalYears,
  createFiscalYear,
  validateFiscalYear,
  closeFiscalYear,
  lockFiscalYear,
  createNextFiscalYear,
  executeYearEndClose,
  generateOpeningBalances,
};