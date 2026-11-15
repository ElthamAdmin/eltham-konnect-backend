const {
  buildReportBundle,
} = require("./reportingService");

const buildProfitAndLoss = async (options = {}) => {
  const report = await buildReportBundle(options);

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
            row.movementDebit !== 0 ||
            row.movementCredit !== 0
          )
      )
      .map((row) => ({
        accountCode: row.accountCode,
        accountName: row.accountName,
        accountCategory:
          row.accountCategory || "Unclassified",
        debit: row.movementDebit,
        credit: row.movementCredit,
      }));

  return {
    ...report.profitAndLoss,

    diagnostics: {
      ...report.profitAndLoss.diagnostics,

      issues: report.diagnostics.issues,

      unclassifiedAccounts,

      classificationReviewRequired:
        unclassifiedAccounts.length > 0,

      closingReviewRequired:
        report.diagnostics.issues.some(
          (issue) => issue.code === "CLOSING_REVIEW"
        ),

      basis:
        "Recorded JMD general-ledger movements for the selected period. " +
        "This is an accrual report, not a cash-receipts/payments report.",

      expenseScope:
        "Expenses include every account currently classified as Expense. " +
        "A separate operating, finance-cost and income-tax breakdown is not yet verified.",

      classificationBasis:
        "Current chart classifications are used, including inactive accounts with recorded activity. " +
        "Unclassified accounts are shown separately and excluded from profit totals.",
    },
  };
};

module.exports = {
  buildProfitAndLoss,
};