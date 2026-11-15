const {
  profitLossService,
} = require("../services/accountingEngine");

const getProfitAndLoss = async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    const options = {};

    for (const field of [
      "from",
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
              "Supply valid reporting dates, branch and business code.",
          });
        }

        options[field] = value.trim();
      }
    }

    const report =
      await profitLossService.buildProfitAndLoss(options);

    return res.json({
      success: true,
      sourceOfTruth: "GeneralLedgerTransaction",
      data: report,
    });
  } catch (error) {
    console.error("Profit and loss error:", error);

    return res
      .status(error.statusCode === 400 ? 400 : 500)
      .json({
        success: false,
        message:
          error.statusCode === 400
            ? error.message
            : "Could not retrieve the Profit & Loss report.",
      });
  }
};

module.exports = {
  getProfitAndLoss,
};