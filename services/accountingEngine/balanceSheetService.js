const { buildReportBundle } = require("./reportingService");

const buildBalanceSheet = async (options = {}) => {
  const report = await buildReportBundle(options);

  return report.balanceSheet;
};

module.exports = {
  buildBalanceSheet,
};