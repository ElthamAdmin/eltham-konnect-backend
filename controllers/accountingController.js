const {
  balanceSheetService,
  profitLossService,
} = require("../services/accountingEngine");

const {
  postJournalEntry,
  ensureSystemAccounts,
  SYSTEM_ACCOUNTS,
} = require("../utils/generalLedgerPoster");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

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
  try {
    await ensureSystemAccounts();

    const profitAndLoss = await profitLossService.buildProfitAndLoss();

    const netProfit = roundMoney(profitAndLoss.netProfit);

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
              accountCode: SYSTEM_ACCOUNTS.CURRENT_YEAR_EARNINGS,
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
              accountCode: SYSTEM_ACCOUNTS.CURRENT_YEAR_EARNINGS,
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
  getBalanceSheet,
  closeYearToRetainedEarnings,
};