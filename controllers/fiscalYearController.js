const fiscalYearService = require("../services/accountingEngine/fiscalYearService");
const yearEndService = require("../services/accountingEngine/yearEndService");
const yearEndAutomationService = require("../services/accountingEngine/yearEndAutomationService");

const handle = (fallback, operation, status = 200) =>
  async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    try {
      const result = await operation(req);

      return res.status(status).json({
        success: true,
        message: result.message || fallback,
        data: result.data,
      });
    } catch (error) {
      console.error(fallback, error);

      const errorStatus =
        error.code === 11000
          ? 409
          : error.name === "ValidationError"
            ? 400
            : [400, 404, 409].includes(error.statusCode)
              ? error.statusCode
              : 500;

      return res.status(errorStatus).json({
        success: false,
        message:
          error.code === 11000
            ? "The fiscal year or monthly period already exists."
            : errorStatus === 500
              ? "Could not complete the fiscal year action."
              : error.message,
      });
    }
  };

const getFiscalYears = handle("Fiscal years loaded.", async () => ({
  data: await fiscalYearService.getFiscalYears(),
}));

const createFiscalYear = handle(
  "Fiscal year and monthly periods prepared.",
  async (req) => ({
    data: await fiscalYearService.createFiscalYear({
      fiscalYear: req.body.fiscalYear,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      totalPeriods: req.body.totalPeriods,
      notes: req.body.notes,
      user: req.user,
    }),
  }),
  201
);

const validateFiscalYear = handle("Checks completed.", async (req) => {
  const data = await fiscalYearService.validateFiscalYear({
    fiscalYear: req.params.fiscalYear,
    mode: req.query.mode || "progress",
  });

  return {
    data,
    message: data.passed
      ? "Selected recorded-data checks passed. Review the warnings."
      : "Checks found items requiring review.",
  };
});

const closeFiscalYear = handle(
  "Annual posting closed. Other year-end work is not marked completed.",
  async (req) => ({
    data: await fiscalYearService.closeFiscalYear({
      fiscalYear: req.params.fiscalYear,
      user: req.user,
    }),
  })
);

const lockFiscalYear = handle("Fiscal year locked.", async (req) => ({
  data: await fiscalYearService.lockFiscalYear({
    fiscalYear: req.params.fiscalYear,
    user: req.user,
  }),
}));

const createNextFiscalYear = handle(
  "Next year prepared. Existing periods and ledger balances preserved.",
  async (req) => ({
    data: await fiscalYearService.createNextFiscalYear({
      fiscalYear: req.params.fiscalYear,
      user: req.user,
    }),
  })
);

const executeYearEndClose = handle("Annual posting closed.", async (req) => {
  const data = await yearEndService.executeYearEndClose({
    fiscalYear: req.params.fiscalYear,
    user: req.user,
  });

  return { data, message: data.message };
});

const generateOpeningBalances = handle(
  "Ledger continuity checked.",
  async (req) => {
    const data = await yearEndService.generateOpeningBalances({
      fiscalYear: req.params.fiscalYear,
    });

    return { data, message: data.message };
  }
);

const runEnterpriseYearEnd = handle("Annual posting closed.", async (req) => {
  const data = await yearEndAutomationService.runEnterpriseYearEnd({
    fiscalYear: req.params.fiscalYear,
    user: req.user,
  });

  return { data, message: data.message };
});

module.exports = {
  getFiscalYears,
  createFiscalYear,
  validateFiscalYear,
  closeFiscalYear,
  lockFiscalYear,
  createNextFiscalYear,
  executeYearEndClose,
  generateOpeningBalances,
  runEnterpriseYearEnd,
};