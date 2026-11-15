const {
  buildReportBundle,
} = require("./reportingService");

const buildBalanceSheet = async (options = {}) => {
  const report = await buildReportBundle({
    to: options.to,
    branch: options.branch,
    entityCode: options.entityCode,
  });

  const categories = new Set([
    "Asset",
    "Liability",
    "Equity",
    "Revenue",
    "Cost of Sales",
    "Expense",
  ]);

  const unclassifiedAccounts =
    report.trialBalance.rows
      .filter(
        (row) =>
          !categories.has(row.accountCategory) &&
          (
            row.trialDebit !== 0 ||
            row.trialCredit !== 0
          )
      )
      .map((row) => ({
        accountCode: row.accountCode,
        accountName: row.accountName,
        accountCategory:
          row.accountCategory || "Unclassified",
        debitBalance: row.trialDebit,
        creditBalance: row.trialCredit,
      }));

  return {
    ...report.balanceSheet,

    equity: {
      ...report.balanceSheet.equity,

      unclosedEarnings:
        report.balanceSheet.equity.currentYearEarnings,
    },

    diagnostics: {
      ...report.balanceSheet.diagnostics,

      issues: report.diagnostics.issues,

      unclassifiedAccounts,

      closingReviewRequired:
        report.diagnostics.issues.some(
          (issue) => issue.code === "CLOSING_REVIEW"
        ),

      basis:
        "Cumulative recorded JMD general-ledger balances through the selected date. " +
        "An opening date is not applied to this balance sheet.",

      classificationBasis:
        "Current chart classifications are used, including inactive accounts with recorded balances. " +
        "Unclassified balances are shown separately and excluded from the accounting equation.",

      earningsBasis:
        "Unclosed earnings include accumulated Revenue less Cost of Sales and Expense balances " +
        "through the selected date, across all years. This is a report calculation; no closing or balancing journal is created.",
    },
  };
};

module.exports = {
  buildBalanceSheet,
};