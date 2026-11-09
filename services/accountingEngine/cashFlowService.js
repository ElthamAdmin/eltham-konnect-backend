const { buildReportBundle } = require("./reportingService");

const buildCashFlow = async (options = {}) => {
  const report = await buildReportBundle(options);

  return report.cashFlow;
};

module.exports = {
  buildCashFlow,
};