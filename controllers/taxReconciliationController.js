const {
  generateEntityPeriodTaxReconciliation,
} = require(
  "../services/taxEntityPeriodReconciliationService"
);

const T = require("../services/taxControl");

const getTaxGlReconciliation = T.handler(
  async (req, res) => {
    const result =
      await generateEntityPeriodTaxReconciliation({
        entityCode: T.text(
          req.query.entityCode,
          "Business entity"
        ).toUpperCase(),

        periodKey: T.text(
          req.query.periodKey,
          "Reporting period"
        ),

        taxType: req.query.taxType
          ? T.text(
              req.query.taxType,
              "Tax type"
            )
          : "",
      });

    return res.json({
      success: true,
      message:
        "Business-period Tax-to-GL comparison generated successfully.",
      ...result,
    });
  }
);

module.exports = {
  getTaxGlReconciliation,
};