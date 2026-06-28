const { buildTrialBalance } = require("./trialBalanceService");
const { roundMoney } = require("./money");

const buildBalanceSheet = async ({ from = "", to = "" } = {}) => {
  const trialBalance = await buildTrialBalance({ from, to });

  const balanceSheetAccounts = trialBalance.rows.filter((row) =>
    ["Asset", "Liability", "Equity"].includes(row.accountCategory)
  );

  const assets = balanceSheetAccounts
    .filter((row) => row.accountCategory === "Asset")
    .map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      amount: roundMoney(row.trialDebit - row.trialCredit),
    }));

  const liabilities = balanceSheetAccounts
    .filter((row) => row.accountCategory === "Liability")
    .map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      amount: roundMoney(row.trialCredit - row.trialDebit),
    }));

  const equity = balanceSheetAccounts
    .filter((row) => row.accountCategory === "Equity")
    .map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      amount: roundMoney(row.trialCredit - row.trialDebit),
    }));

  const totalAssets = roundMoney(
    assets.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  const totalLiabilities = roundMoney(
    liabilities.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  const totalEquity = roundMoney(
    equity.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  const liabilitiesPlusEquity = roundMoney(totalLiabilities + totalEquity);
  const difference = roundMoney(totalAssets - liabilitiesPlusEquity);

  return {
    filters: trialBalance.filters,
    assets: {
      accounts: assets,
      total: totalAssets,
    },
    liabilities: {
      accounts: liabilities,
      total: totalLiabilities,
    },
    equity: {
      accounts: equity,
      total: totalEquity,
    },
    totals: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      liabilitiesPlusEquity,
      difference,
      isBalanced: difference === 0,
    },
    diagnostics: {
      trialBalanceIsBalanced: trialBalance.totals.isBalanced,
      trialBalanceDifference: trialBalance.totals.difference,
      balanceSheetIsBalanced: difference === 0,
    },
  };
};

module.exports = {
  buildBalanceSheet,
};