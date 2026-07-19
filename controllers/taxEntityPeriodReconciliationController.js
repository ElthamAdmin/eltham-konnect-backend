const {
  generateEntityPeriodTaxReconciliation,
} = require(
  "../services/taxEntityPeriodReconciliationService"
);

const getEntityPeriodTaxReconciliation = async (
  req,
  res
) => {
  try {
    const result =
      await generateEntityPeriodTaxReconciliation({
        entityCode: req.query.entityCode,
        periodKey: req.query.periodKey,
        taxType: req.query.taxType,
      });

    return res.json({
      success: true,
      message:
        "Entity-period Tax-to-GL reconciliation generated successfully.",
      ...result,
    });
  } catch (error) {
    console.error(
      "Entity-period Tax-to-GL reconciliation error:",
      error
    );

    return res
      .status(error.statusCode || 500)
      .json({
        success: false,
        message:
          error.message ||
          "Could not generate entity-period Tax-to-GL reconciliation.",
      });
  }
};

module.exports = {
  getEntityPeriodTaxReconciliation,
};