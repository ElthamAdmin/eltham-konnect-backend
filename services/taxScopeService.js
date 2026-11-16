const BusinessEntity = require(
  "../models/BusinessEntity"
);

const T = require("./taxControl");

const snapshot = (entity) =>
  JSON.parse(
    JSON.stringify({
      entityId: entity._id,
      entityCode: entity.entityCode,
      legalName: entity.legalName,
      tradingName: entity.tradingName,
      entityType: entity.entityType,
      lifecycleStatus:
        entity.lifecycleStatus,
      effectiveFrom:
        entity.effectiveFrom,
      effectiveTo:
        entity.effectiveTo,
      trn: entity.trn,
      registrationNumber:
        entity.registrationNumber,
      taxTreatment:
        entity.taxTreatment,
      accountingConfiguration:
        entity.accountingConfiguration,
    })
  );

const resolve = async (
  entityCode,
  periodStart,
  periodEnd,
  session = null,
  operational = false
) => {
  const normalizedCode = T.text(
    entityCode,
    "Business entity"
  ).toUpperCase();

  const start = T.date(
    periodStart,
    "Period start"
  );

  const end = T.date(
    periodEnd,
    "Period end"
  );

  const entity =
    await BusinessEntity.findOne({
      entityCode: normalizedCode,
    }).session(session);

  if (!entity) {
    T.fail(
      "Business entity not found.",
      404
    );
  }

  if (
    start > end ||
    start < entity.effectiveFrom ||
    (entity.effectiveTo &&
      end > entity.effectiveTo)
  ) {
    T.fail(
      "The tax period must lie within this entity's operating dates. Split a transition period into reviewed entity-specific records.",
      409
    );
  }

  if (
    operational &&
    (
      entity.lifecycleStatus !== "Active" ||
      !entity.accountingConfiguration
        ?.coaInitialized ||
      !entity.accountingConfiguration
        ?.reportingInitialized
    )
  ) {
    T.fail(
      "This entity is not active and ready for new tax obligations.",
      409
    );
  }

  return entity;
};

const fromQuery = async (req) => {
  const entityCode = T.text(
    req.query.entityCode,
    "Business entity"
  ).toUpperCase();

  const periodKey = T.period(
    req.query.periodKey ||
      req.query.payPeriod
  );

  const entity =
    await BusinessEntity.findOne({
      entityCode,
    }).lean();

  if (!entity) {
    T.fail(
      "Business entity not found.",
      404
    );
  }

  return {
    entityCode,
    periodKey,
    entity,
  };
};

module.exports = {
  resolve,
  snapshot,
  fromQuery,
};