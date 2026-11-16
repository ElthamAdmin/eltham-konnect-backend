const crypto = require("crypto");
const T = require("./taxControl");

const fail = (
  message,
  statusCode = 409
) => T.fail(message, statusCode);

const text = T.text;
const date = T.date;
const today = T.today;

const previousDay = (value) => {
  const parsed = new Date(
    `${date(value)}T12:00:00.000Z`
  );

  parsed.setUTCDate(
    parsed.getUTCDate() - 1
  );

  return parsed
    .toISOString()
    .slice(0, 10);
};

const fingerprint = (
  entities,
  code,
  effectiveDate,
  predecessorCode
) => {
  const snapshots = entities
    .map((entity) =>
      JSON.parse(
        JSON.stringify(
          typeof entity.toObject ===
            "function"
            ? entity.toObject()
            : entity
        )
      )
    )
    .sort((first, second) =>
      first.entityCode.localeCompare(
        second.entityCode
      )
    );

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        code,
        effectiveDate,
        predecessorCode,
        entities: snapshots,
      })
    )
    .digest("hex");
};

const assess = ({
  entities,
  code,
  effectiveDate,
  predecessorCode,
  currentDate = today(),
}) => {
  date(
    effectiveDate,
    "Operational effective date"
  );

  date(
    currentDate,
    "Current date"
  );

  if (effectiveDate !== currentDate) {
    fail(
      "Activation must be performed on the selected operational effective date in Jamaica. Registration can be recorded beforehand; activation is not automatic."
    );
  }

  const entity = entities.find(
    (record) =>
      record.entityCode === code
  );

  const predecessor = entities.find(
    (record) =>
      record.entityCode ===
      predecessorCode
  );

  if (!entity) {
    fail("LLC entity not found.", 404);
  }

  if (!predecessor) {
    fail(
      "Sole-proprietorship entity not found.",
      404
    );
  }

  if (
    entity.entityType !==
      "Limited Liability Company" ||
    entity.lifecycleStatus !==
      "Registered"
  ) {
    fail(
      "The successor must be a Registered LLC."
    );
  }

  if (
    predecessor.entityType !==
      "Sole Proprietorship" ||
    predecessor.lifecycleStatus !==
      "Active"
  ) {
    fail(
      "The predecessor must be the Active sole proprietorship."
    );
  }

  for (const field of [
    "registrationNumber",
    "trn",
    "incorporationDate",
    "registrationDate",
  ]) {
    text(entity[field], field);
  }

  for (const field of [
    "incorporationDate",
    "registrationDate",
  ]) {
    if (
      date(entity[field], field) >
      effectiveDate
    ) {
      fail(
        `${field} cannot be later than the operational switch date.`
      );
    }
  }

  if (
    date(
      entity.effectiveFrom,
      "LLC effective-from date"
    ) !== effectiveDate ||
    entity.effectiveTo
  ) {
    fail(
      "The LLC effective-from date must equal the operational switch date, and its effective-to date must be blank."
    );
  }

  const predecessorEnd =
    previousDay(effectiveDate);

  if (
    date(
      predecessor.effectiveFrom,
      "Sole-proprietorship effective-from date"
    ) >= effectiveDate
  ) {
    fail(
      "The sole proprietorship must have started before the LLC operating period."
    );
  }

  if (
    predecessor.effectiveTo &&
    date(
      predecessor.effectiveTo,
      "Sole-proprietorship effective-to date"
    ) !== predecessorEnd
  ) {
    fail(
      "The sole-proprietorship end date conflicts with the proposed transition."
    );
  }

  if (
    entity.predecessorEntityCode &&
    entity.predecessorEntityCode !==
      predecessorCode
  ) {
    fail(
      "The LLC is linked to a different predecessor."
    );
  }

  if (
    predecessor.successorEntityCode &&
    predecessor.successorEntityCode !==
      code
  ) {
    fail(
      "The sole proprietorship is linked to a different successor."
    );
  }

  if (
    !entity.accountingConfiguration
      ?.coaInitialized ||
    !entity.accountingConfiguration
      ?.reportingInitialized
  ) {
    fail(
      "Complete Chart of Accounts and financial-reporting initialization before activation."
    );
  }

  const taxTreatment =
    entity.taxTreatment || {};

  if (
    taxTreatment.incomeTaxType !==
      "Company Income Tax" ||
    !taxTreatment.incomeTaxRuleCode ||
    ![
      "Configured",
      "Verified",
      "Active",
    ].includes(
      taxTreatment.taxConfigurationStatus
    )
  ) {
    fail(
      "Configure the reviewed company income-tax treatment before activation."
    );
  }

  if (
    !taxTreatment.gctRegistrationCode
  ) {
    fail(
      "Assign a reviewed LLC GCT registration or monitoring profile before activation."
    );
  }

  const overlappingEntities =
    entities.filter((record) => {
      if (
        record.entityCode === code ||
        record.entityCode ===
          predecessorCode ||
        record.lifecycleStatus !==
          "Active"
      ) {
        return false;
      }

      date(
        record.effectiveFrom,
        `${record.entityCode}: effective-from date`
      );

      if (!record.effectiveTo) {
        return true;
      }

      return (
        date(
          record.effectiveTo,
          `${record.entityCode}: effective-to date`
        ) >= effectiveDate
      );
    });

  if (overlappingEntities.length) {
    fail(
      "Another operating entity overlaps the LLC period: " +
        overlappingEntities
          .map(
            (record) =>
              record.entityCode
          )
          .join(", ") +
        "."
    );
  }

  return {
    entity,
    predecessor,
    predecessorEnd,
  };
};

module.exports = {
  fail,
  text,
  date,
  today,
  previousDay,
  fingerprint,
  assess,
};