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

const {
  postJournalEntry,
  SYSTEM_ACCOUNTS,
  ensureSystemAccounts,
} = require("../utils/generalLedgerPoster");

const closeYearToRetainedEarnings = async (req, res) => {
  try {
    await ensureSystemAccounts();

    const revenueAccounts = await ChartOfAccount.find({
      accountCategory: "Revenue",
    });

    const expenseAccounts = await ChartOfAccount.find({
      $or: [
        { accountCategory: "Expense" },
        { accountCategory: "Cost of Sales" },
      ],
    });

    let totalRevenue = 0;
    let totalExpenses = 0;

    revenueAccounts.forEach((account) => {
      totalRevenue += Number(account.currentBalance || 0);
    });

    expenseAccounts.forEach((account) => {
      totalExpenses += Number(account.currentBalance || 0);
    });

    const netProfit = totalRevenue - totalExpenses;

    if (netProfit === 0) {
      return res.status(400).json({
        success: false,
        message: "No net profit/loss available to close.",
      });
    }

    const lines =
      netProfit > 0
        ? [
            {
              accountCode: SYSTEM_ACCOUNTS.RETAINED_EARNINGS,
              debit: 0,
              credit: netProfit,
              description: "Year-end retained earnings closing",
            },
            {
              accountCode: SYSTEM_ACCOUNTS.OWNER_EQUITY,
              debit: netProfit,
              credit: 0,
              description: "Close current earnings into equity",
            },
          ]
        : [
            {
              accountCode: SYSTEM_ACCOUNTS.RETAINED_EARNINGS,
              debit: Math.abs(netProfit),
              credit: 0,
              description: "Year-end retained earnings loss closing",
            },
            {
              accountCode: SYSTEM_ACCOUNTS.OWNER_EQUITY,
              debit: 0,
              credit: Math.abs(netProfit),
              description: "Close current loss into equity",
            },
          ];

    const entry = await postJournalEntry({
      entryDate: new Date().toISOString().slice(0, 10),
      memo: "Year-end closing to retained earnings",
      reference: `YEAR-END-${Date.now()}`,
      sourceModule: "Year End Closing",
      createdBy:
        req.user?.name ||
        req.user?.fullName ||
        req.user?.email ||
        "System User",
      lines,
    });

    res.json({
      success: true,
      message: "Year-end closing completed successfully",
      netProfit,
      journalEntry: entry,
    });
  } catch (error) {
    console.error("Year-end closing error:", error);

    res.status(500).json({
      success: false,
      message: "Could not complete year-end closing",
      error: error.message,
    });
  }
};

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

let totalRevenue = 0;
let totalCostOfSales = 0;
let totalExpenses = 0;

      accounts.forEach((account) => {
        const item = {
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType,
          balance: Number(account.currentBalance || 0),
        };

        if (account.accountCategory === "Revenue") {
  totalRevenue += Number(account.currentBalance || 0);
}

if (account.accountCategory === "Cost of Sales") {
  totalCostOfSales += Number(account.currentBalance || 0);
}

if (account.accountCategory === "Expense") {
  totalExpenses += Number(account.currentBalance || 0);
}

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

      const currentNetProfit = roundMoney(
  totalRevenue - totalCostOfSales - totalExpenses
);

const adjustedEquity = roundMoney(
  totalEquity + currentNetProfit
);

const accountingDifference = roundMoney(
  totalAssets -
  (totalLiabilities + adjustedEquity)
);

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
  currentNetProfit,
  adjustedEquity,
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

  closeYearToRetainedEarnings,
};