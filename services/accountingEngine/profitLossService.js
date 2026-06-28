const { buildTrialBalance } = require("./trialBalanceService");
const { roundMoney } = require("./money");

const buildProfitAndLoss = async ({ from = "", to = "" } = {}) => {
  const trialBalance = await buildTrialBalance({ from, to });

  const revenueAccounts = trialBalance.rows
    .filter((row) => row.accountCategory === "Revenue")
    .map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      amount: roundMoney(row.trialCredit - row.trialDebit),
    }));

  const costOfSalesAccounts = trialBalance.rows
    .filter((row) => row.accountCategory === "Cost of Sales")
    .map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      amount: roundMoney(row.trialDebit - row.trialCredit),
    }));

  const expenseAccounts = trialBalance.rows
    .filter((row) => row.accountCategory === "Expense")
    .map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      amount: roundMoney(row.trialDebit - row.trialCredit),
    }));

  const totalRevenue = roundMoney(
    revenueAccounts.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  const totalCostOfSales = roundMoney(
    costOfSalesAccounts.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  const grossProfit = roundMoney(totalRevenue - totalCostOfSales);

  const totalOperatingExpenses = roundMoney(
    expenseAccounts.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  const netProfit = roundMoney(grossProfit - totalOperatingExpenses);

  return {
    filters: trialBalance.filters,
    revenue: {
      accounts: revenueAccounts,
      total: totalRevenue,
    },
    costOfSales: {
      accounts: costOfSalesAccounts,
      total: totalCostOfSales,
    },
    grossProfit,
    operatingExpenses: {
      accounts: expenseAccounts,
      total: totalOperatingExpenses,
    },
    netProfit,
    diagnostics: {
      trialBalanceIsBalanced: trialBalance.totals.isBalanced,
      trialBalanceDifference: trialBalance.totals.difference,
    },
  };
};

module.exports = {
  buildProfitAndLoss,
};