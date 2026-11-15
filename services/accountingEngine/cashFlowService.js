const { buildReportBundle } = require("./reportingService");

const buildCashFlow = async (options = {}) => {
  const report = await buildReportBundle(options);

  return {
    ...report.cashFlow,

    diagnostics: {
      ...report.cashFlow.diagnostics,
      outOfBalance: report.diagnostics.outOfBalance,
      issues: report.diagnostics.issues,
      basis:
        "Recorded JMD general-ledger cash/bank movements. " +
        "Balances have not been verified against bank statements.",
      accountScope:
        "Cash/bank classification uses the current account configuration, " +
        "including inactive accounts with historical ledger activity.",
    },
  };
};

module.exports = {
  buildCashFlow,
};