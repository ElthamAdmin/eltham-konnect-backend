const { buildTrialBalance } = require("./trialBalanceService");
const { buildProfitAndLoss } = require("./profitLossService");
const { roundMoney } = require("./money");

const PROFESSIONAL_EQUITY_ORDER = [
  "3000",
  "3010",
  "3050",
  "3100",
  "3200",
  "CURRENT-EARNINGS",
];

const sortEquityAccounts = (accounts = []) =>
  accounts.sort((a, b) => {
    const aIndex = PROFESSIONAL_EQUITY_ORDER.indexOf(a.accountCode);
    const bIndex = PROFESSIONAL_EQUITY_ORDER.indexOf(b.accountCode);

    if (aIndex === -1 && bIndex === -1) {
      return String(a.accountCode).localeCompare(String(b.accountCode));
    }

    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;

    return aIndex - bIndex;
  });

const buildBalanceSheet = async ({ from = "", to = "" } = {}) => {
  const trialBalance = await buildTrialBalance({ from, to });
  const profitAndLoss = await buildProfitAndLoss({ from, to });

  const assets = trialBalance.rows
    .filter((row) => row.accountCategory === "Asset")
    .map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      amount: roundMoney(row.trialDebit - row.trialCredit),
    }));

  const liabilities = trialBalance.rows
    .filter((row) => row.accountCategory === "Liability")
    .map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      amount: roundMoney(row.trialCredit - row.trialDebit),
    }));

  const equityAccounts = trialBalance.rows
    .filter((row) => row.accountCategory === "Equity")
    .map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      amount: roundMoney(row.trialCredit - row.trialDebit),
    }));

  const currentYearEarnings = roundMoney(profitAndLoss.netProfit);

  const hasRealCurrentYearEarningsAccount = equityAccounts.some(
    (account) => account.accountCode === "3200" && Number(account.amount || 0) !== 0
  );

  const displayEquityAccounts = [...equityAccounts];

  if (!hasRealCurrentYearEarningsAccount && currentYearEarnings !== 0) {
    displayEquityAccounts.push({
      accountCode: "CURRENT-EARNINGS",
      accountName: "Current Year Profit / Loss",
      amount: currentYearEarnings,
    });
  }

  const equity = sortEquityAccounts(displayEquityAccounts);

  const totalAssets = roundMoney(
    assets.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  const totalLiabilities = roundMoney(
    liabilities.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  const ownerEquityOnly = roundMoney(
    equityAccounts.reduce((sum, row) => sum + Number(row.amount || 0), 0)
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
      ownerEquityOnly,
      currentYearEarnings,
    },

    totals: {
      totalAssets,
      totalLiabilities,
      ownerEquityOnly,
      currentYearEarnings,
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