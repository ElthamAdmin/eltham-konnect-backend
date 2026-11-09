const {
  buildOperationalDashboard,
} = require("../services/operationalDashboardService");

const {
  dashboardService,
  rebuildAllAccountBalancesFromLedger,
} = require("../services/accountingEngine");

const {
  buildFinanceReport,
} = require("../services/financeReportService");

const {
  buildReportBundle,
} = require("../services/accountingEngine/reportingService");

/*
|--------------------------------------------------------------------------
| Operational Dashboard
|--------------------------------------------------------------------------
*/

const getOperationalDashboard = async (req, res) => {
  try {
    const data = await buildOperationalDashboard({
      from: req.query.from,
      to: req.query.to,
      branch: req.query.branch,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "Error getting operational dashboard:",
      error
    );

    return res
      .status(error.status === 400 ? 400 : 500)
      .json({
        success: false,
        message:
          error.status === 400
            ? error.message
            : "Failed to retrieve operational dashboard.",
      });
  }
};

/*
|--------------------------------------------------------------------------
| Reporting Error Response
|--------------------------------------------------------------------------
*/

const sendReportingError = (res, error, message) => {
  const status = error.statusCode === 400 ? 400 : 500;

  return res.status(status).json({
    success: false,
    message: status === 400 ? error.message : message,
  });
};

/*
|--------------------------------------------------------------------------
| Finance Summary
|--------------------------------------------------------------------------
*/

const getFinanceSummary = async (req, res) => {
  try {
    const summary =
      await dashboardService.buildDashboardSummary(
        req.query
      );

    return res.json({
      success: true,
      data: {
        ...summary,

        // Preserve existing response names.
        totalRevenue: summary.kpis.totalRevenue,
        outstandingRevenue:
          summary.kpis.outstandingReceivables,
        totalExpenses: summary.kpis.totalExpenses,

        // Already included in totalExpenses.
        totalPayroll:
          summary.profitAndLoss.payrollExpense,

        paidInvoices: summary.kpis.paidInvoiceCount,
        unpaidInvoices: summary.kpis.unpaidInvoiceCount,
        cashOnHand: summary.kpis.cashBalance,
        netPosition: summary.kpis.netProfit,
      },
    });
  } catch (error) {
    console.error("Error getting finance summary:", error);

    return sendReportingError(
      res,
      error,
      "Failed to retrieve finance summary."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Financial Reports
|--------------------------------------------------------------------------
*/

const getFinancialReports = async (req, res) => {
  try {
    const data = await buildFinanceReport(req.query);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "Error getting financial reports:",
      error
    );

    return sendReportingError(
      res,
      error,
      "Failed to retrieve financial reports."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Monthly Revenue, Expenses and Profit
|--------------------------------------------------------------------------
*/

const getMonthlyIncomeVsExpenses = async (req, res) => {
  try {
    const report = await buildReportBundle(req.query);

    return res.json({
      success: true,
      data: report.monthlyTrend,
      filters: report.filters,

      reportMeta: {
        generatedAt: new Date().toISOString(),
        sourceOfTruth: "Recorded General Ledger, JMD",
        expenseBasis:
          "Cost of Sales plus all expense accounts; payroll is included once.",
        issues: report.diagnostics.issues,
      },
    });
  } catch (error) {
    console.error(
      "Error getting monthly income vs expenses:",
      error
    );

    return sendReportingError(
      res,
      error,
      "Failed to retrieve monthly chart data."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Existing Balance Rebuild
|--------------------------------------------------------------------------
*/

const rebuildFinanceBalances = async (req, res) => {
  try {
    const rebuiltAccounts =
      await rebuildAllAccountBalancesFromLedger();

    res.json({
      success: true,
      message:
        "Finance balances rebuilt successfully from General Ledger.",
      totalAccountsRebuilt: rebuiltAccounts.length,
      data: rebuiltAccounts,
    });
  } catch (error) {
    console.error(
      "Error rebuilding finance balances:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to rebuild finance balances",
      error: error.message,
    });
  }
};

module.exports = {
  getOperationalDashboard,
  getFinanceSummary,
  getFinancialReports,
  getMonthlyIncomeVsExpenses,
  rebuildFinanceBalances,
};