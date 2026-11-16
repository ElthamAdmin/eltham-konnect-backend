const BusinessEntity = require(
  "../models/BusinessEntity"
);
const T = require("./taxControl");

const normalizeEntityDate = (value) =>
  T.date(value, "Entity date");

const validateNoEntityOverlap = async ({
  effectiveFrom,
  effectiveTo = "",
  excludeEntityId = null,
  session = null,
}) => {
  const startDate =
    normalizeEntityDate(effectiveFrom);

  const endDate = effectiveTo
    ? normalizeEntityDate(effectiveTo)
    : "9999-12-31";

  if (endDate < startDate) {
    T.fail(
      "Entity effective-to date cannot be earlier than its effective-from date."
    );
  }

  const query = {
    lifecycleStatus: "Active",

    effectiveFrom: {
      $lte: endDate,
    },

    $or: [
      { effectiveTo: "" },
      { effectiveTo: null },
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
    await BusinessEntity.findOne(
      query
    ).session(session);

  if (overlappingEntity) {
    T.fail(
      `Operating period overlaps ${overlappingEntity.entityCode} ` +
        `(${overlappingEntity.effectiveFrom} to ` +
        `${overlappingEntity.effectiveTo || "open-ended"}).`,
      409
    );
  }

  return true;
};

const getBusinessEntityForDate = async (
  dateValue,
  options = {}
) => {
  const entityDate =
    normalizeEntityDate(dateValue);

  const session =
    options.session || null;

  // Legacy callers may still supply
  // includeRegistered/includePlanned.
  // Operating resolution always requires Active.
  const entities =
    await BusinessEntity.find({
      lifecycleStatus: "Active",

      effectiveFrom: {
        $lte: entityDate,
      },

      $or: [
        { effectiveTo: "" },
        { effectiveTo: null },
        {
          effectiveTo: {
            $gte: entityDate,
          },
        },
      ],
    })
      .sort({
        effectiveFrom: -1,
        entityCode: 1,
      })
      .session(session);

  if (entities.length === 0) {
    T.fail(
      `No Active business entity is effective for ${entityDate}.`,
      409
    );
  }

  if (entities.length > 1) {
    T.fail(
      `Multiple Active business entities are effective for ${entityDate}. Resolve their operating periods before posting.`,
      409
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