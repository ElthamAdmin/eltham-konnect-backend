const Payroll = require("../models/Payroll");

const {
  trialBalanceService,
  balanceSheetService,
  profitLossService,
  cashFlowService,
  dashboardService,
  rebuildAllAccountBalancesFromLedger,
} = require("../services/accountingEngine");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getFinanceSummary = async (req, res) => {
  try {
    const { from = "", to = "" } = req.query;

    const summary = await dashboardService.buildDashboardSummary({ from, to });

    res.json({
      success: true,
      data: {
        ...summary,

        totalRevenue: summary.kpis.totalRevenue,
        outstandingRevenue: summary.kpis.outstandingReceivables,
        totalExpenses: summary.kpis.totalExpenses,
        totalPayroll: 0,
        paidInvoices: summary.kpis.paidInvoiceCount,
        unpaidInvoices: summary.kpis.unpaidInvoiceCount,
        cashOnHand: summary.kpis.cashBalance,
        netPosition: summary.kpis.netProfit,
      },
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

    const expenseByCategory = [
      ...profitAndLoss.costOfSales.accounts,
      ...profitAndLoss.operatingExpenses.accounts,
    ].map((item) => ({
      category: item.accountName,
      amount: item.amount,
    }));

    const payroll = await Payroll.find();

    const statutoryTotals = {
      nisEmployee: roundMoney(payroll.reduce((s, p) => s + Number(p.nisEmployee || 0), 0)),
      nhtEmployee: roundMoney(payroll.reduce((s, p) => s + Number(p.nhtEmployee || 0), 0)),
      educationTax: roundMoney(payroll.reduce((s, p) => s + Number(p.educationTax || 0), 0)),
      incomeTax: roundMoney(payroll.reduce((s, p) => s + Number(p.incomeTax || 0), 0)),
      pensionEmployee: roundMoney(payroll.reduce((s, p) => s + Number(p.pensionEmployee || 0), 0)),
      totalDeductions: roundMoney(payroll.reduce((s, p) => s + Number(p.totalDeductions || p.deductions || 0), 0)),
    };

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

        profitAndLossLegacy: profitAndLoss,

        expenseByCategory,
        statutoryTotals,

        monthlyTrend: [],

        profitAndLoss: {
          ...profitAndLoss,
          revenue: profitAndLoss.revenue.total,
          costOfSales: profitAndLoss.costOfSales.total,
          grossProfit: profitAndLoss.grossProfit,
          operatingExpenses: profitAndLoss.operatingExpenses.total,
          payrollExpense: expenseByCategory
            .filter((e) => String(e.category).toLowerCase().includes("payroll"))
            .reduce((s, e) => s + Number(e.amount || 0), 0),
          totalExpenses: roundMoney(
            profitAndLoss.costOfSales.total +
              profitAndLoss.operatingExpenses.total
          ),
          netProfit: profitAndLoss.netProfit,
        },
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
    const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

    const ledgerTransactions = await GeneralLedgerTransaction.find().sort({
      entryDate: 1,
      createdAt: 1,
    });

    const monthMap = {};

    ledgerTransactions.forEach((item) => {
      const date = new Date(item.entryDate || item.createdAt);
      if (Number.isNaN(date.getTime())) return;

      const monthKey = date.toISOString().slice(0, 7);

      if (!monthMap[monthKey]) {
        monthMap[monthKey] = {
          month: monthKey,
          income: 0,
          expenses: 0,
        };
      }

      if (item.accountCategory === "Revenue") {
        monthMap[monthKey].income = roundMoney(
          monthMap[monthKey].income +
            Number(item.credit || 0) -
            Number(item.debit || 0)
        );
      }

      if (
        item.accountCategory === "Expense" ||
        item.accountCategory === "Cost of Sales"
      ) {
        monthMap[monthKey].expenses = roundMoney(
          monthMap[monthKey].expenses +
            Number(item.debit || 0) -
            Number(item.credit || 0)
        );
      }
    });

    res.json({
      success: true,
      data: Object.values(monthMap).sort((a, b) =>
        a.month.localeCompare(b.month)
      ),
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