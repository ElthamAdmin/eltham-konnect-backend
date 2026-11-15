const {
  balanceSheetService,
} = require("../services/accountingEngine");

const getBalanceSheet = async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    if (
      req.query.from !== undefined &&
      (
        typeof req.query.from !== "string" ||
        req.query.from.trim() !== ""
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A balance sheet uses an as-of date only. Remove the starting date.",
      });
    }

    const options = {};

    for (const field of [
      "to",
      "branch",
      "entityCode",
    ]) {
      const value = req.query[field];

      if (value !== undefined) {
        if (
          typeof value !== "string" ||
          value.length > 120
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Supply a valid as-of date, branch and business code.",
          });
        }

        options[field] = value.trim();
      }
    }

    const report =
      await balanceSheetService.buildBalanceSheet(options);

    return res.json({
      success: true,
      sourceOfTruth: "GeneralLedgerTransaction",
      balanced: report.totals.isBalanced,
      totalAssets: report.totals.totalAssets,
      totalLiabilities: report.totals.totalLiabilities,
      totalEquity: report.totals.totalEquity,
      liabilitiesPlusEquity:
        report.totals.liabilitiesPlusEquity,
      difference: report.totals.difference,
      data: report,
    });
  } catch (error) {
    console.error("Balance sheet error:", error);

    return res
      .status(error.statusCode === 400 ? 400 : 500)
      .json({
        success: false,
        message:
          error.statusCode === 400
            ? error.message
            : "Could not retrieve the Balance Sheet.",
      });
  }
};

module.exports = {
  getBalanceSheet,
};