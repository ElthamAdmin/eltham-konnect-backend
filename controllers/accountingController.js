const {
  balanceSheetService,
  profitLossService,
} = require("../services/accountingEngine");

const getProfitAndLoss = async (req, res) => {
  try {
    const { from = "", to = "" } = req.query;

    const profitAndLoss = await profitLossService.buildProfitAndLoss({
      from,
      to,
    });

    res.json({
      success: true,
      data: {
        filters: profitAndLoss.filters,
        reportTitle: "Profit and Loss Statement",
        generatedAt: new Date().toISOString(),

        revenue: profitAndLoss.revenue.accounts.map((item) => ({
          account: `${item.accountCode} - ${item.accountName}`,
          amount: item.amount,
        })),

        costOfSales: profitAndLoss.costOfSales.accounts.map((item) => ({
          account: `${item.accountCode} - ${item.accountName}`,
          amount: item.amount,
        })),

        expenses: profitAndLoss.operatingExpenses.accounts.map((item) => ({
          account: `${item.accountCode} - ${item.accountName}`,
          amount: item.amount,
        })),

        totals: {
          totalRevenue: profitAndLoss.revenue.total,
          totalCostOfSales: profitAndLoss.costOfSales.total,
          grossProfit: profitAndLoss.grossProfit,
          totalExpenses: profitAndLoss.operatingExpenses.total,
          netProfit: profitAndLoss.netProfit,
        },

        engine: profitAndLoss,
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

const getBalanceSheet = async (req, res) => {
  try {
    const { from = "", to = "" } = req.query;

    const balanceSheet = await balanceSheetService.buildBalanceSheet({
      from,
      to,
    });

    res.json({
      success: true,
      sourceOfTruth: "GeneralLedgerTransaction",
      data: {
        reportTitle: "Balance Sheet",
        generatedAt: new Date().toISOString(),

        assets: balanceSheet.assets.accounts.map((item) => ({
          accountCode: item.accountCode,
          accountName: item.accountName,
          accountType: "",
          balance: item.amount,
        })),

        liabilities: balanceSheet.liabilities.accounts.map((item) => ({
          accountCode: item.accountCode,
          accountName: item.accountName,
          accountType: "",
          balance: item.amount,
        })),

        equity: balanceSheet.equity.accounts.map((item) => ({
  accountCode: item.accountCode,
  accountName: item.accountName,
  accountType:
    item.accountCode === "CURRENT-EARNINGS"
      ? "Current Year Earnings"
      : "Equity",
  balance: item.amount,
})),

        totals: {
  totalAssets: balanceSheet.totals.totalAssets,
  totalLiabilities: balanceSheet.totals.totalLiabilities,
  ownerEquityOnly: balanceSheet.equity.ownerEquityOnly,
  currentYearEarnings: balanceSheet.equity.currentYearEarnings,
  totalEquity: balanceSheet.totals.totalEquity,
  accountingDifference: balanceSheet.totals.difference,
  isBalanced: balanceSheet.totals.isBalanced,
},

        engine: balanceSheet,
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
};

const closeYearToRetainedEarnings = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  return res.status(410).json({
    success: false,
    message:
      "This retained-earnings transfer endpoint has been retired. Use Fiscal Years for annual posting controls. Existing balances continue through the ledger without reposting.",
  });
};

module.exports = {
  getProfitAndLoss,
  getBalanceSheet,
  closeYearToRetainedEarnings,
};