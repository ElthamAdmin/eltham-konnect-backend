const {
  buildCashFlow,
} = require("../services/accountingEngine/cashFlowService");

const getCashFlowStatement = async (req, res) => {
  try {
    const options = {};

    for (const field of ["from", "to"]) {
      const value = req.query[field];

      if (value !== undefined) {
        if (typeof value !== "string") {
          return res.status(400).json({
            success: false,
            message: "Report dates must be YYYY-MM-DD values.",
          });
        }

        options[field] = value.trim();
      }
    }

    const data = await buildCashFlow(options);

    res.set("Cache-Control", "no-store");

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Cash Flow Statement Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Could not generate the cash movement report.",
    });
  }
};

module.exports = {
  getCashFlowStatement,
};