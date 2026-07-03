const { balanceSheetService } = require("../services/accountingEngine");

const getBalanceSheet = async (req, res) => {
  try {
    const { from = "", to = "" } = req.query;

    const report = await balanceSheetService.buildBalanceSheet({
      from,
      to,
    });

    res.json({
      success: true,
      sourceOfTruth: "GeneralLedgerTransaction",
      balanced: report.totals.isBalanced,
      totalAssets: report.totals.totalAssets,
      totalLiabilities: report.totals.totalLiabilities,
      totalEquity: report.totals.totalEquity,
      liabilitiesPlusEquity: report.totals.liabilitiesPlusEquity,
      difference: report.totals.difference,
      data: report,
    });
  } catch (error) {
    console.error("Balance sheet error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve balance sheet",
      error: error.message,
    });
  }
};

module.exports = {
  getBalanceSheet,
};