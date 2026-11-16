const {
  generateEntityPeriodTaxReconciliation,
} = require(
  "../services/taxEntityPeriodReconciliationService"
);

const T = require(
  "../services/taxControl"
);

const getEntityPeriodTaxReconciliation =
  T.handler(
    async (req, res) => {
      const entityCode = T.text(
        req.query.entityCode,
        "Business entity"
      ).toUpperCase();

      const periodKey = T.text(
        req.query.periodKey,
        "Reporting period"
      );

      const taxType = T.text(
        req.query.taxType ?? "",
        "Tax type",
        false
      );

      const result =
        await generateEntityPeriodTaxReconciliation({
          entityCode,
          periodKey,
          taxType,
        });

      return res.json({
        success: true,

        message:
          "Entity-period Tax-to-GL comparison generated successfully.",

        ...result,
      });
    }
  );

module.exports = {
  getEntityPeriodTaxReconciliation,
};