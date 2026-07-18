const BusinessEntity = require(
  "../models/BusinessEntity"
);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeEntityDate = (value) => {
  const text = String(value || "")
    .trim()
    .slice(0, 10);

  if (!DATE_PATTERN.test(text)) {
    throw new Error(
      "Entity date must use YYYY-MM-DD format."
    );
  }

  const parsedDate = new Date(
    `${text}T12:00:00.000Z`
  );

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(
      "A valid entity date is required."
    );
  }

  return text;
};

const validateNoEntityOverlap = async ({
  effectiveFrom,
  effectiveTo = "",
  excludeEntityId = null,
}) => {
  const startDate =
    normalizeEntityDate(effectiveFrom);

  const endDate = effectiveTo
    ? normalizeEntityDate(effectiveTo)
    : "9999-12-31";

  const query = {
    lifecycleStatus: {
      $in: [
        "Registered",
        "Active",
      ],
    },

    effectiveFrom: {
      $lte: endDate,
    },

    $or: [
      {
        effectiveTo: "",
      },
      {
        effectiveTo: {
          $gte: startDate,
        },
      },
    ],
  };

  if (excludeEntityId) {
    query._id = {
      $ne: excludeEntityId,
    };
  }

  const overlappingEntity =
    await BusinessEntity.findOne(query);

  if (overlappingEntity) {
    throw new Error(
      `Entity period overlaps ${overlappingEntity.entityCode} ` +
      `(${overlappingEntity.effectiveFrom} to ` +
      `${overlappingEntity.effectiveTo || "open-ended"}).`
    );
  }

  return true;
};

const getBusinessEntityForDate = async (
  dateValue,
  {
    includeRegistered = true,
    includePlanned = false,
  } = {}
) => {
  const entityDate =
    normalizeEntityDate(dateValue);

  const allowedStatuses = ["Active"];

  if (includeRegistered) {
    allowedStatuses.push("Registered");
  }

  if (includePlanned) {
    allowedStatuses.push(
      "Planned",
      "Registration In Progress"
    );
  }

  const entities = await BusinessEntity.find({
    lifecycleStatus: {
      $in: allowedStatuses,
    },

    effectiveFrom: {
      $lte: entityDate,
    },

    $or: [
      {
        effectiveTo: "",
      },
      {
        effectiveTo: {
          $gte: entityDate,
        },
      },
    ],
  }).sort({
    effectiveFrom: -1,
  });

  if (entities.length === 0) {
    throw new Error(
      `No effective business entity is configured for ${entityDate}.`
    );
  }

  if (entities.length > 1) {
    throw new Error(
      `Multiple business entities are effective for ${entityDate}. Resolve the overlapping entity dates before posting.`
    );
  }

  return entities[0];
};

const getBusinessEntitySnapshot = async (
  dateValue,
  options = {}
) => {
  const entity =
    await getBusinessEntityForDate(
      dateValue,
      options
    );

  return {
    entityId: entity._id,
    entityCode: entity.entityCode,
    legalName: entity.legalName,
    tradingName: entity.tradingName,
    businessType: entity.entityType,
    registrationNumber:
      entity.registrationNumber,
    trn: entity.trn,
    effectiveFrom:
      entity.effectiveFrom,
    effectiveTo:
      entity.effectiveTo,

    fiscalYearStart:
      entity.fiscalYearStart,
    fiscalYearEnd:
      entity.fiscalYearEnd,

    incomeTaxType:
      entity.taxTreatment
        ?.incomeTaxType ||
      "Not Configured",

    incomeTaxRuleCode:
      entity.taxTreatment
        ?.incomeTaxRuleCode ||
      "",

    gctRegistrationStatus:
      entity.taxTreatment
        ?.gctRegistrationStatus ||
      "Not Registered",

    gctRegistrationCode:
      entity.taxTreatment
        ?.gctRegistrationCode ||
      "",

    coaStructureCode:
      entity.accountingConfiguration
        ?.coaStructureCode ||
      "",

    resolvedForDate:
      normalizeEntityDate(dateValue),

    snapshotCreatedAt:
      new Date(),
  };
};

const assertEntityCanPost = (
  entity
) => {
  if (!entity) {
    throw new Error(
      "A business entity is required for posting."
    );
  }

  if (
    entity.lifecycleStatus !== "Active"
  ) {
    throw new Error(
      `${entity.entityCode} cannot post transactions while its status is ${entity.lifecycleStatus}.`
    );
  }

  if (
    !entity.accountingConfiguration
      ?.coaInitialized
  ) {
    throw new Error(
      `${entity.entityCode} cannot post until its Chart of Accounts is initialized.`
    );
  }

  if (
    !entity.accountingConfiguration
      ?.reportingInitialized
  ) {
    throw new Error(
      `${entity.entityCode} cannot post until financial reporting is initialized.`
    );
  }

  return true;
};

module.exports = {
  normalizeEntityDate,
  validateNoEntityOverlap,
  getBusinessEntityForDate,
  getBusinessEntitySnapshot,
  assertEntityCanPost,
};