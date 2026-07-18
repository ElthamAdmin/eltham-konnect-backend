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

const getBusinessEntitySnapshot = (entity) => {
  if (!entity) return null;

  const source =
    typeof entity.toObject === "function"
      ? entity.toObject()
      : entity;

  return {
    entityId: source._id || null,
    entityCode: source.entityCode || "",
    legalName: source.legalName || "",
    tradingName: source.tradingName || "",
    entityType: source.entityType || "",
    lifecycleStatus: source.lifecycleStatus || "",
    effectiveFrom: source.effectiveFrom || "",
    effectiveTo: source.effectiveTo || null,
    registrationNumber: source.registrationNumber || "",
    registrationDate: source.registrationDate || "",
    incorporationDate: source.incorporationDate || null,
    trn: source.trn || "",
    registeredAddress: source.registeredAddress || "",
    fiscalYearStart: source.fiscalYearStart || "01-01",
    fiscalYearEnd: source.fiscalYearEnd || "12-31",

    taxTreatment: {
      incomeTaxType:
        source.taxTreatment?.incomeTaxType || "Not Configured",
      incomeTaxRuleCode:
        source.taxTreatment?.incomeTaxRuleCode || "",
      gctRegistrationStatus:
        source.taxTreatment?.gctRegistrationStatus ||
        "Not Registered",
      gctRegistrationCode:
        source.taxTreatment?.gctRegistrationCode || "",
      payrollEmployerReference:
        source.taxTreatment?.payrollEmployerReference || "",
      taxConfigurationStatus:
        source.taxTreatment?.taxConfigurationStatus ||
        "Not Configured",
    },

    accountingConfiguration: {
      coaStructureCode:
        source.accountingConfiguration?.coaStructureCode || "",
      coaInitialized: Boolean(
        source.accountingConfiguration?.coaInitialized
      ),
      openingBalancesPosted: Boolean(
        source.accountingConfiguration?.openingBalancesPosted
      ),
      reportingInitialized: Boolean(
        source.accountingConfiguration?.reportingInitialized
      ),
      openingBalanceBatchNumber:
        source.accountingConfiguration
          ?.openingBalanceBatchNumber || "",
    },

    predecessorEntityCode:
      source.predecessorEntityCode || "",
    successorEntityCode:
      source.successorEntityCode || "",
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