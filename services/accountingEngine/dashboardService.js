const Invoice = require("../../models/Invoice");
const { buildTrialBalance } = require("./trialBalanceService");
const { buildProfitAndLoss } = require("./profitLossService");
const { buildBalanceSheet } = require("./balanceSheetService");
const { buildCashFlow } = require("./cashFlowService");
const { roundMoney } = require("./money");

const buildDashboardSummary = async ({ from = "", to = "" } = {}) => {
  const [trialBalance, profitLoss, balanceSheet, cashFlow, invoices] =
    await Promise.all([
      buildTrialBalance({ from, to }),
      buildProfitAndLoss({ from, to }),
      buildBalanceSheet({ from, to }),
      buildCashFlow({ from, to }),
      Invoice.find(),
    ]);

  const unpaidInvoices = invoices.filter((invoice) =>
    ["Unpaid", "Partially Paid"].includes(String(invoice.status || ""))
  );

  const paidInvoices = invoices.filter(
    (invoice) => String(invoice.status || "") === "Paid"
  );

  const outstandingReceivables = roundMoney(
    unpaidInvoices.reduce(
      (sum, invoice) =>
        sum +
        Number(
          invoice.balanceDue && invoice.balanceDue > 0
            ? invoice.balanceDue
            : invoice.finalTotal || 0
        ),
      0
    )
  );

  return {
    filters: { from, to },
    kpis: {
      totalRevenue: profitLoss.revenue.total,
      totalExpenses: roundMoney(
        profitLoss.costOfSales.total + profitLoss.operatingExpenses.total
      ),
      netProfit: profitLoss.netProfit,
      cashBalance: roundMoney(
        cashFlow.cashAccounts.reduce(
          (sum, account) => sum + Number(account.currentBalance || 0),
          0
        )
      ),
      outstandingReceivables,
      paidInvoiceCount: paidInvoices.length,
      unpaidInvoiceCount: unpaidInvoices.length,
    },
    health: {
      trialBalanceBalanced: trialBalance.totals.isBalanced,
      balanceSheetBalanced: balanceSheet.totals.isBalanced,
      trialBalanceDifference: trialBalance.totals.difference,
      balanceSheetDifference: balanceSheet.totals.difference,
      accountingStatus:
        trialBalance.totals.isBalanced && balanceSheet.totals.isBalanced
          ? "Healthy"
          : "Needs Review",
    },
    sections: {
      profitLoss,
      balanceSheet,
      cashFlow,
      trialBalance: {
        totals: trialBalance.totals,
        diagnostics: trialBalance.diagnostics,
      },
    },
  };
};

module.exports = {
  buildDashboardSummary,
};