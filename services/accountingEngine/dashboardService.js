const {
  buildFinanceReport,
} = require("../financeReportService");

const buildDashboardSummary = async (options = {}) => {
  const report = await buildFinanceReport(options);
  const meta = report.reportMeta;

  return {
    filters: report.filters,
    kpis: report.kpis,
    health: report.health,
    sections: report.sections,
    profitAndLoss: report.profitAndLoss,
    monthlyTrend: report.monthlyTrend,
    treasury: report.treasury,
    invoiceStats: report.invoiceStats,
    diagnostics: report.diagnostics,

    // Individual payroll details belong in Financial Reports.
    reportMeta: {
      generatedAt: meta.generatedAt,
      reportTitle: meta.reportTitle,
      sourceOfTruth: meta.sourceOfTruth,
      periodBasis: meta.periodBasis,
      businessScope: meta.businessScope,
      reconciliationStatus: meta.reconciliationStatus,
      issues: meta.issues,
    },
  };
};

module.exports = {
  buildDashboardSummary,
};