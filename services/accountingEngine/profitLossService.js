const { buildReportBundle } = require("./reportingService");

const buildProfitAndLoss = async (options = {}) => {
  const report = await buildReportBundle(options);

  return report.profitAndLoss;
};

module.exports = {
  buildProfitAndLoss,
};