const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizeDate = (value) => {
  if (!value) return null;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const isWithinDateRange = (entryDate, startDate, endDate) => {
  const date = normalizeDate(entryDate);

  if (!date) return false;

  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;

  return true;
};

const getDateRange = (from = "", to = "") => {
  let startDate = null;
  let endDate = null;

  if (from) {
    startDate = normalizeDate(from);
  }

  if (to) {
    endDate = normalizeDate(to);
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }
  }

  return { startDate, endDate };
};

const getProfitAndLoss = async (req, res) => {
  try {
    const { from = "", to = "" } = req.query;
    const { startDate, endDate } = getDateRange(from, to);

    const ledgerTransactions = await GeneralLedgerTransaction.find();

    const filtered = ledgerTransactions.filter((item) =>
      isWithinDateRange(item.entryDate, startDate, endDate)
    );

    const revenueMap = {};
    const costOfSalesMap = {};
    const expenseMap = {};

    filtered.forEach((item) => {
      const category = item.accountCategory || "";
      const key = `${item.accountCode} - ${item.accountName}`;

      const debit = Number(item.debit || 0);
      const credit = Number(item.credit || 0);

      if (category === "Revenue") {
        revenueMap[key] = roundMoney(
          Number(revenueMap[key] || 0) + credit - debit
        );
      }

      if (category === "Cost of Sales") {
        costOfSalesMap[key] = roundMoney(
          Number(costOfSalesMap[key] || 0) + debit - credit
        );
      }

      if (category === "Expense") {
        expenseMap[key] = roundMoney(
          Number(expenseMap[key] || 0) + debit - credit
        );
      }
    });

    const revenue = Object.entries(revenueMap)
      .map(([account, amount]) => ({ account, amount }))
      .filter((item) => item.amount !== 0);

    const costOfSales = Object.entries(costOfSalesMap)
      .map(([account, amount]) => ({ account, amount }))
      .filter((item) => item.amount !== 0);

    const expenses = Object.entries(expenseMap)
      .map(([account, amount]) => ({ account, amount }))
      .filter((item) => item.amount !== 0);

    const totalRevenue = roundMoney(
      revenue.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );

    const totalCostOfSales = roundMoney(
      costOfSales.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );

    const grossProfit = roundMoney(totalRevenue - totalCostOfSales);

    const totalExpenses = roundMoney(
      expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    );

    const netProfit = roundMoney(grossProfit - totalExpenses);

    res.json({
      success: true,
      data: {
        filters: { from, to },
        reportTitle: "Profit and Loss Statement",
        generatedAt: new Date().toISOString(),
        revenue,
        costOfSales,
        expenses,
        totals: {
          totalRevenue,
          totalCostOfSales,
          grossProfit,
          totalExpenses,
          netProfit,
        },
      },
    });
  } catch (error) {
    console.error("Profit and loss report error:", error);
    res.status(500).json({
      success: false,
      message: "Could not generate profit and loss report",
      error: error.message,
    });
  }
};

const ChartOfAccount = require("../models/ChartOfAccount");

module.exports = {
  getProfitAndLoss,

  getBalanceSheet: async (req, res) => {
    try {
      const accounts = await ChartOfAccount.find({
        status: "Active",
      }).sort({
        accountCode: 1,
      });

      const assets = [];
      const liabilities = [];
      const equity = [];

      let totalAssets = 0;
      let totalLiabilities = 0;
      let totalEquity = 0;

      accounts.forEach((account) => {
        const item = {
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType,
          balance: Number(account.currentBalance || 0),
        };

        if (account.accountCategory === "Asset") {
          assets.push(item);
          totalAssets += item.balance;
        }

        if (account.accountCategory === "Liability") {
          liabilities.push(item);
          totalLiabilities += item.balance;
        }

        if (account.accountCategory === "Equity") {
          equity.push(item);
          totalEquity += item.balance;
        }
      });

      const accountingDifference =
        totalAssets - (totalLiabilities + totalEquity);

      res.json({
        success: true,

        data: {
          reportTitle: "Balance Sheet",

          generatedAt: new Date().toISOString(),

          assets,

          liabilities,

          equity,

          totals: {
            totalAssets,
            totalLiabilities,
            totalEquity,
            accountingDifference,
            isBalanced:
              Math.round(accountingDifference * 100) / 100 === 0,
          },
        },
      });
    } catch (error) {
      console.error("Balance sheet error:", error);

      res.status(500).json({
        success: false,
        message: "Could not generate balance sheet",
        error: error.message,
      });
    }
  },
};