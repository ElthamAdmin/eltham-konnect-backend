const TaxDeadlineRule = require(
  "../models/TaxDeadlineRule"
);

const T = require("./taxControl");

const parseYmd = (
  value,
  label = "Date"
) =>
  new Date(
    `${T.date(value, label)}T12:00:00.000Z`
  );

const formatYmd = (date) =>
  date.toISOString().slice(0, 10);

const adjustForWeekend = (
  date,
  mode = "None"
) => {
  if (
    ![
      "None",
      "Previous Business Day",
      "Next Business Day",
    ].includes(mode)
  ) {
    T.fail(
      "Invalid weekend-adjustment method."
    );
  }

  const result = new Date(date);
  const day = result.getUTCDay();

  if (mode === "Previous Business Day") {
    if (day === 6) {
      result.setUTCDate(
        result.getUTCDate() - 1
      );
    } else if (day === 0) {
      result.setUTCDate(
        result.getUTCDate() - 2
      );
    }
  }

  if (mode === "Next Business Day") {
    if (day === 6) {
      result.setUTCDate(
        result.getUTCDate() + 2
      );
    } else if (day === 0) {
      result.setUTCDate(
        result.getUTCDate() + 1
      );
    }
  }

  return result;
};

const calculateDueDate = ({
  periodEnd,
  rule,
}) => {
  if (!rule) {
    T.fail(
      "A deadline rule is required."
    );
  }

  const endDate = parseYmd(
    periodEnd,
    "Period end"
  );

  const settings =
    rule.dueDateRule || {};

  const months = Number(
    settings.monthsAfterPeriodEnd ?? 0
  );

  const days = Number(
    settings.daysAfterPeriodEnd ?? 0
  );

  const fixedDay = Number(
    settings.fixedDayOfMonth ?? 0
  );

  if (
    ![months, days, fixedDay].every(
      (value) =>
        Number.isSafeInteger(value) &&
        value >= 0
    ) ||
    fixedDay > 31
  ) {
    T.fail(
      "Deadline offsets must be valid nonnegative whole numbers."
    );
  }

  const methodCount = [
    days > 0,
    fixedDay > 0,
    settings.useMonthEnd === true,
  ].filter(Boolean).length;

  if (methodCount !== 1) {
    T.fail(
      "A deadline rule must use exactly one due-date method."
    );
  }

  const dueDate = new Date(endDate);

  if (days > 0) {
    if (months !== 0) {
      T.fail(
        "A days-after-period rule cannot also specify a month offset."
      );
    }

    dueDate.setUTCDate(
      dueDate.getUTCDate() + days
    );
  } else {
    dueDate.setUTCDate(1);

    dueDate.setUTCMonth(
      dueDate.getUTCMonth() + months
    );

    const lastDay = new Date(
      Date.UTC(
        dueDate.getUTCFullYear(),
        dueDate.getUTCMonth() + 1,
        0,
        12
      )
    ).getUTCDate();

    dueDate.setUTCDate(
      settings.useMonthEnd === true
        ? lastDay
        : Math.min(fixedDay, lastDay)
    );
  }

  if (
    Number.isNaN(dueDate.getTime())
  ) {
    T.fail(
      "The deadline rule produced an invalid date."
    );
  }

  return formatYmd(
    adjustForWeekend(
      dueDate,
      settings.weekendAdjustment ||
        "None"
    )
  );
};

const getDeadlineRuleForRecord = async ({
  taxType,
  businessType,
  periodEnd,
  filingFrequency,
  session = null,
}) => {
  if (
    !businessType ||
    !filingFrequency
  ) {
    T.fail(
      "Business type and filing frequency must be confirmed before applying deadlines.",
      409
    );
  }

  const effectiveDate = parseYmd(
    periodEnd,
    "Period end"
  );

  const rules =
    await TaxDeadlineRule.find({
      countryCode: "JM",

      taxType: {
        $in: T.variants(
          T.canonical(taxType)
        ),
      },

      status: "Active",
      filingFrequency,

      businessType: {
        $in: [businessType, "All"],
      },

      effectiveFrom: {
        $lte: effectiveDate,
      },

      $or: [
        { effectiveTo: null },
        {
          effectiveTo: {
            $gte: effectiveDate,
          },
        },
      ],
    }).session(session);

  const specificRules =
    rules.filter(
      (rule) =>
        rule.businessType ===
        businessType
    );

  const matchingRules =
    specificRules.length > 0
      ? specificRules
      : rules.filter(
          (rule) =>
            rule.businessType ===
            "All"
        );

  if (matchingRules.length !== 1) {
    T.fail(
      `Exactly one effective deadline rule must match ${taxType}, ${businessType}, and ${filingFrequency} for the period ending ${periodEnd}.`,
      409
    );
  }

  const rule = matchingRules[0];

  if (
    !rule.sourceName?.trim() ||
    (!rule.sourceUrl?.trim() &&
      !rule.sourceReference?.trim()) ||
    !rule.sourceVerifiedAt
  ) {
    T.fail(
      `Deadline rule ${rule.ruleCode} requires verified source information.`,
      409
    );
  }

  return rule;
};

const buildDeadlineSnapshot = (rule) =>
  JSON.parse(
    JSON.stringify({
      ruleCode: rule.ruleCode,
      name: rule.name,
      countryCode: rule.countryCode,
      taxType: rule.taxType,
      businessType: rule.businessType,
      filingFrequency:
        rule.filingFrequency,
      filingForm: rule.filingForm,

      effectiveFrom:
        rule.effectiveFrom,

      effectiveTo:
        rule.effectiveTo,

      dueDateRule:
        rule.dueDateRule || {},

      reminderDays:
        rule.reminderDays || [],

      sourceName: rule.sourceName,
      sourceUrl: rule.sourceUrl,
      sourceReference:
        rule.sourceReference,

      sourceVerifiedAt:
        rule.sourceVerifiedAt,

      notice:
        "Weekend adjustment only. Public-holiday extensions require a verified override; no holiday extension is assumed.",
    })
  );

const applyDeadlineRuleToRecord = async (
  taxRecord,
  session = null
) => {
  if (!taxRecord) {
    T.fail(
      "A tax record is required."
    );
  }

  if (
    taxRecord.deadlineOverride
      ?.isOverridden
  ) {
    T.date(
      taxRecord.dueDate,
      "Overridden due date"
    );

    return taxRecord;
  }

  const rule =
    await getDeadlineRuleForRecord({
      taxType: taxRecord.taxType,
      businessType:
        taxRecord.businessType,
      periodEnd: taxRecord.periodEnd,
      filingFrequency:
        taxRecord.filingFrequency,
      session,
    });

  taxRecord.dueDate =
    calculateDueDate({
      periodEnd:
        taxRecord.periodEnd,
      rule,
    });

  taxRecord.deadlineRuleId =
    rule._id;

  taxRecord.deadlineRuleCode =
    rule.ruleCode;

  taxRecord.deadlineRuleSnapshot =
    buildDeadlineSnapshot(rule);

  return taxRecord;
};

module.exports = {
  parseYmd,
  formatYmd,
  adjustForWeekend,
  calculateDueDate,
  getDeadlineRuleForRecord,
  buildDeadlineSnapshot,
  applyDeadlineRuleToRecord,
};