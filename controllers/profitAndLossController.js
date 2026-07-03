const { profitLossService } = require("../services/accountingEngine");

const getProfitAndLoss = async (req, res) => {
  try {
    const { from = "", to = "" } = req.query;

    const report = await profitLossService.buildProfitAndLoss({
  from,
  to,
});

    res.json({
      success: true,
      sourceOfTruth: "GeneralLedgerTransaction",
      data: report,
    });
  } catch (error) {
    console.error("Profit and loss error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve profit and loss statement",
      error: error.message,
    });
  }
};

module.exports = {
  getProfitAndLoss,
};