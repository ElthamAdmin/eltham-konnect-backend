const TaxDeadlineRule = require(
  "../models/TaxDeadlineRule"
);

const parseYmd = (value, label = "Date") => {
  const text = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(
      `${label} must use YYYY-MM-DD format.`
    );
  }

  const date = new Date(`${text}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is invalid.`);
  }

  return date;
};

const formatYmd = (date) =>
  date.toISOString().slice(0, 10);

const addUtcDays = (date, days) => {
  const result = new Date(date);
  result.setUTCDate(
    result.getUTCDate() + Number(days || 0)
  );
  return result;
};

const addUtcMonths = (date, months) => {
  const result = new Date(date);

  result.setUTCDate(1);
  result.setUTCMonth(
    result.getUTCMonth() + Number(months || 0)
  );

  return result;
};

const getLastDayOfUtcMonth = (date) =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      0,
      12
    )
  );

const setClampedUtcDay = (date, dayOfMonth) => {
  const result = new Date(date);

  const lastDay =
    getLastDayOfUtcMonth(result).getUTCDate();

  result.setUTCDate(
    Math.min(
      Math.max(1, Number(dayOfMonth || 1)),
      lastDay
    )
  );

  return result;
};

const adjustForWeekend = (
  date,
  weekendAdjustment = "None"
) => {
  const result = new Date(date);
  const day = result.getUTCDay();

  if (weekendAdjustment === "Previous Business Day") {
    if (day === 6) {
      return addUtcDays(result, -1);
    }

    if (day === 0) {
      return addUtcDays(result, -2);
    }
  }

  if (weekendAdjustment === "Next Business Day") {
    if (day === 6) {
      return addUtcDays(result, 2);
    }

    if (day === 0) {
      return addUtcDays(result, 1);
    }
  }

  return result;
};

const calculateDueDate = ({
  periodEnd,
  rule,
}) => {
  if (!rule) {
    throw new Error(
      "A Tax Center deadline rule is required."
    );
  }

  const endDate = parseYmd(
    periodEnd,
    "Period end"
  );

  const dueRule = rule.dueDateRule || {};
  const monthsAfterPeriodEnd = Number(
    dueRule.monthsAfterPeriodEnd || 0
  );

  let dueDate;

  if (Number(dueRule.daysAfterPeriodEnd || 0) > 0) {
    dueDate = addUtcDays(
      endDate,
      Number(dueRule.daysAfterPeriodEnd)
    );
  } else if (dueRule.useMonthEnd === true) {
    dueDate = getLastDayOfUtcMonth(
      addUtcMonths(
        endDate,
        monthsAfterPeriodEnd
      )
    );
  } else if (
    Number(dueRule.fixedDayOfMonth || 0) > 0
  ) {
    dueDate = setClampedUtcDay(
      addUtcMonths(
        endDate,
        monthsAfterPeriodEnd
      ),
      Number(dueRule.fixedDayOfMonth)
    );
  } else {
    throw new Error(
      `Deadline rule ${rule.ruleCode} has no due-date method.`
    );
  }

  dueDate = adjustForWeekend(
    dueDate,
    dueRule.weekendAdjustment
  );

  return formatYmd(dueDate);
};

const getDeadlineRuleForRecord = async ({
  taxType,
  businessType,
  periodEnd,
}) => {
  const effectiveDate = parseYmd(
    periodEnd,
    "Period end"
  );

  const rule = await TaxDeadlineRule.findOne({
    countryCode: "JM",
    taxType,
    status: "Active",

    businessType: {
      $in: [
        businessType || "Sole Proprietorship",
        "All",
      ],
    },

    effectiveFrom: {
      $lte: effectiveDate,
    },

    $or: [
      {
        effectiveTo: null,
      },
      {
        effectiveTo: {
          $gte: effectiveDate,
        },
      },
    ],
  }).sort({
    businessType: 1,
    effectiveFrom: -1,
  });

  if (!rule) {
    throw new Error(
      `No active deadline rule exists for ${taxType}, ` +
      `${businessType || "Sole Proprietorship"}, ` +
      `period ending ${periodEnd}.`
    );
  }

  return rule;
};

const buildDeadlineSnapshot = (rule) => ({
  ruleCode: rule.ruleCode,
  name: rule.name,
  countryCode: rule.countryCode,
  taxType: rule.taxType,
  businessType: rule.businessType,
  filingFrequency: rule.filingFrequency,
  filingForm: rule.filingForm,
  effectiveFrom: rule.effectiveFrom,
  effectiveTo: rule.effectiveTo,

  dueDateRule: JSON.parse(
    JSON.stringify(rule.dueDateRule || {})
  ),

  reminderDays: Array.isArray(rule.reminderDays)
    ? [...rule.reminderDays]
    : [],

  sourceName: rule.sourceName,
  sourceUrl: rule.sourceUrl,
  sourceReference: rule.sourceReference,
  sourceVerifiedAt: rule.sourceVerifiedAt,
});

const applyDeadlineRuleToRecord = async (
  taxRecord
) => {
  if (!taxRecord) {
    throw new Error("Tax record is required.");
  }

  if (
    taxRecord.deadlineOverride?.isOverridden &&
    taxRecord.dueDate
  ) {
    return taxRecord;
  }

  const rule = await getDeadlineRuleForRecord({
    taxType: taxRecord.taxType,
    businessType: taxRecord.businessType,
    periodEnd: taxRecord.periodEnd,
  });

  const dueDate = calculateDueDate({
    periodEnd: taxRecord.periodEnd,
    rule,
  });

  taxRecord.dueDate = dueDate;
  taxRecord.deadlineRuleId = rule._id;
  taxRecord.deadlineRuleCode = rule.ruleCode;
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