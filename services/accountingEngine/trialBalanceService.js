const { buildReportBundle } = require("./reportingService");

const buildTrialBalance = async (options = {}) => {
  const report = await buildReportBundle(options);

  return report.trialBalance;
};

module.exports = {
  buildTrialBalance,
};