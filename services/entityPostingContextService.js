const BusinessEntity = require("../models/BusinessEntity");

const cleanText = (value) =>
  String(value || "").trim();

const buildEntitySnapshot = (entity) => ({
  entityId: entity._id,
  entityCode: entity.entityCode,
  legalName: entity.legalName,
  tradingName: entity.tradingName || "",
  entityType: entity.entityType,
  lifecycleStatus: entity.lifecycleStatus,
  effectiveFrom: entity.effectiveFrom,
  effectiveTo: entity.effectiveTo,
  registrationNumber: entity.registrationNumber || "",
  registrationDate: entity.registrationDate || "",
  incorporationDate: entity.incorporationDate || null,
  trn: entity.trn || "",
  registeredAddress: entity.registeredAddress || "",
  fiscalYearStart: entity.fiscalYearStart || "",
  fiscalYearEnd: entity.fiscalYearEnd || "",
  taxTreatment: entity.taxTreatment,
  accountingConfiguration:
    entity.accountingConfiguration,
  predecessorEntityCode:
    entity.predecessorEntityCode || "",
  successorEntityCode:
    entity.successorEntityCode || "",
});

const resolveEntityPostingContext = async ({
  source,
  sourceName = "Source record",
}) => {
  const entityCode = cleanText(
    source?.entityCode ||
      source?.entitySnapshot?.entityCode
  );

  if (!entityCode) {
    const error = new Error(
      `${sourceName} does not have an entity code. Entity attribution must be completed before accounting can be posted.`
    );

    error.statusCode = 409;
    throw error;
  }

  const entity = await BusinessEntity.findOne({
    entityCode,
  });

  if (!entity) {
    const error = new Error(
      `Business entity ${entityCode} was not found.`
    );

    error.statusCode = 404;
    throw error;
  }

  const sourceEntityId = cleanText(
    source?.entityId ||
      source?.entitySnapshot?.entityId
  );

  if (
    sourceEntityId &&
    sourceEntityId !== cleanText(entity._id)
  ) {
    const error = new Error(
      `${sourceName} entity ID does not match ${entityCode}.`
    );

    error.statusCode = 409;
    throw error;
  }

  return {
    entityId: entity._id,
    entityCode: entity.entityCode,
    entitySnapshot:
      source?.entitySnapshot?.entityCode ===
      entity.entityCode
        ? source.entitySnapshot
        : buildEntitySnapshot(entity),
  };
};

module.exports = {
  buildEntitySnapshot,
  resolveEntityPostingContext,
};