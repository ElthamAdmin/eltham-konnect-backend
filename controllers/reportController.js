const {
  trialBalanceService,
  balanceSheetService,
  profitLossService,
  cashFlowService,
  dashboardService,
  rebuildAllAccountBalancesFromLedger,
} = require("../services/accountingEngine");

const getFinanceSummary = async (req, res) => {
  try {
    const { from = "", to = "" } = req.query;

    const summary = await dashboardService.buildDashboardSummary({
      from,
      to,
    });

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error getting finance summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve finance summary",
      error: error.message,
    });
  }
};

const getFinancialReports = async (req, res) => {
  try {
    const { from = "", to = "" } = req.query;

    const [trialBalance, balanceSheet, profitAndLoss, cashFlow] =
      await Promise.all([
        trialBalanceService.buildTrialBalance({ from, to }),
        balanceSheetService.buildBalanceSheet({ from, to }),
        profitLossService.buildProfitAndLoss({ from, to }),
        cashFlowService.buildCashFlow({ from, to }),
      ]);

    res.json({
      success: true,
      data: {
        filters: { from, to },
        reportMeta: {
          generatedAt: new Date().toISOString(),
          reportTitle: "EKOS Accounting Engine Reports",
          sourceOfTruth: "General Ledger via Accounting Engine",
        },
        trialBalance,
        balanceSheet,
        profitAndLoss,
        cashFlow,
      },
    });
  } catch (error) {
    console.error("Error getting financial reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve financial reports",
      error: error.message,
    });
  }
};

const getMonthlyIncomeVsExpenses = async (req, res) => {
  try {
    const { from = "", to = "" } = req.query;

    const profitAndLoss = await profitLossService.buildProfitAndLoss({
      from,
      to,
    });

    res.json({
      success: true,
      data: {
        filters: { from, to },
        revenue: profitAndLoss.revenue,
        costOfSales: profitAndLoss.costOfSales,
        operatingExpenses: profitAndLoss.operatingExpenses,
        grossProfit: profitAndLoss.grossProfit,
        netProfit: profitAndLoss.netProfit,
      },
    });
  } catch (error) {
    console.error("Error getting monthly income vs expenses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve monthly chart data",
      error: error.message,
    });
  }
};

const rebuildFinanceBalances = async (req, res) => {
  try {
    const rebuiltAccounts = await rebuildAllAccountBalancesFromLedger();

    res.json({
      success: true,
      message: "Finance balances rebuilt successfully from General Ledger.",
      totalAccountsRebuilt: rebuiltAccounts.length,
      data: rebuiltAccounts,
    });
  } catch (error) {
    console.error("Error rebuilding finance balances:", error);
    res.status(500).json({
      success: false,
      message: "Failed to rebuild finance balances",
      error: error.message,
    });
  }
};

module.exports = {
  getFinanceSummary,
  getFinancialReports,
  getMonthlyIncomeVsExpenses,
  rebuildFinanceBalances,
};