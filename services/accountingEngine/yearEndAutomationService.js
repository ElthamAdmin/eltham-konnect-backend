const yearEndService = require("./yearEndService");

// Compatibility for existing callers.
// Preparing the next year and locking remain separate explicit actions.
const runEnterpriseYearEnd = async (options) => {
  const result = await yearEndService.executeYearEndClose(options);

  return {
    success: true,
    message:
      "Annual posting closed. Preparing the next year and locking are separate actions. No opening balances were posted.",
    previousFiscalYear: result.year,
    yearEndClose: result,
    completedSteps: [
      "Annual closing checks passed",
      "Annual posting blocked",
      "Existing ledger balances preserved without reposting",
    ],
  };
};

module.exports = {
  runEnterpriseYearEnd,
};