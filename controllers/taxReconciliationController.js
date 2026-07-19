const {
  getTaxToGlReconciliation,
} = require("../services/taxReconciliationService");

const getTaxGlReconciliation = async (
  req,
  res
) => {
  try {
    const reconciliation =
      await getTaxToGlReconciliation({
        taxType: req.query.taxType || "",
      });

    res.json({
      success: true,
      message:
        "Tax-to-GL reconciliation generated successfully",
      filters: {
        taxType:
          reconciliation.taxType || "",
      },
      generatedAt:
        reconciliation.generatedAt,
      summary: reconciliation.summary,
      data: reconciliation.data,
    });
  } catch (error) {
    console.error(
      "Tax-to-GL reconciliation error:",
      error
    );

    const statusCode =
      /No General Ledger payable mapping exists/i.test(
        error.message
      )
        ? 400
        : 500;

    res.status(statusCode).json({
      success: false,
      message:
        statusCode === 400
          ? error.message
          : "Could not generate Tax-to-GL reconciliation",
      error: error.message,
    });
  }
};

module.exports = {
  getTaxGlReconciliation,
};