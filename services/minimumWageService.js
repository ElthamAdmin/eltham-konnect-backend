const MinimumWageRule = require(
  "../models/MinimumWageRule"
);

const roundMoney = (value) =>
  Math.round(
    (Number(value || 0) +
      Number.EPSILON) *
      100
  ) / 100;

const roundHours = (value) =>
  Math.round(
    (Number(value || 0) +
      Number.EPSILON) *
      100
  ) / 100;

const normalizeAssessmentDate = (
  value
) => {
  if (!value) {
    throw new Error(
      "A valid assessment date is required."
    );
  }

  const normalizedValue =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      normalizedValue.getTime()
    )
  ) {
    throw new Error(
      "A valid assessment date is required."
    );
  }

  return normalizedValue;
};

const resolveMinimumWageRule = async ({
  assessmentDate,
  workerCategory = "General",
}) => {
  const normalizedDate =
    normalizeAssessmentDate(
      assessmentDate
    );

  const rule =
    await MinimumWageRule.findOne({
      workerCategory,
      status: "Active",
      effectiveFrom: {
        $lte: normalizedDate,
      },
      $or: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            $gte: normalizedDate,
          },
        },
      ],
    }).sort({
      effectiveFrom: -1,
      createdAt: -1,
    });

  return rule;
};

const buildMinimumWageAssessment =
  async ({
    assessmentDate,
    workedHours,
    grossPay,
    applicable = true,
    workerCategory = "General",
    attendancePeriodNumber = "",
  }) => {
    const safeWorkedHours =
      roundHours(
        Math.max(
          0,
          Number(workedHours || 0)
        )
      );

    const assessedGrossPay =
      roundMoney(
        Math.max(
          0,
          Number(grossPay || 0)
        )
      );

    if (!applicable) {
      return {
        applicable: false,
        workerCategory,
        hourlyRate: 0,
        weeklyRate: 0,
        standardWeeklyHours: 0,
        workedHours:
          safeWorkedHours,
        minimumGrossPay: 0,
        assessedGrossPay,
        shortfall: 0,
        compliant: true,
        assessmentStatus:
          "Not Applicable",
        warning:
          "Minimum-wage assessment was marked as not applicable.",
        ruleId: null,
        ruleCode: "",
        ruleSnapshot: null,
        attendancePeriodNumber:
          String(
            attendancePeriodNumber ||
              ""
          ).trim(),
        assessedAt: new Date(),
      };
    }

    const rule =
      await resolveMinimumWageRule({
        assessmentDate,
        workerCategory,
      });

    if (!rule) {
      return {
        applicable: true,
        workerCategory,
        hourlyRate: 0,
        weeklyRate: 0,
        standardWeeklyHours: 0,
        workedHours:
          safeWorkedHours,
        minimumGrossPay: 0,
        assessedGrossPay,
        shortfall: 0,
        compliant: false,
        assessmentStatus:
          "Not Assessed",
        warning:
          "No active effective-dated minimum-wage rule exists for the assessment date and worker category.",
        ruleId: null,
        ruleCode: "",
        ruleSnapshot: null,
        attendancePeriodNumber:
          String(
            attendancePeriodNumber ||
              ""
          ).trim(),
        assessedAt: new Date(),
      };
    }

    if (safeWorkedHours <= 0) {
      return {
        applicable: true,
        workerCategory,
        hourlyRate:
          roundMoney(
            rule.hourlyRate
          ),
        weeklyRate:
          roundMoney(
            rule.weeklyRate
          ),
        standardWeeklyHours:
          roundHours(
            rule.standardWeeklyHours
          ),
        workedHours: 0,
        minimumGrossPay: 0,
        assessedGrossPay,
        shortfall: 0,
        compliant: false,
        assessmentStatus:
          "Not Assessed",
        warning:
          "Payable working hours are required before minimum-wage compliance can be assessed.",
        ruleId: rule._id,
        ruleCode: rule.ruleCode,
        ruleSnapshot: {
          ruleCode:
            rule.ruleCode,
          name: rule.name,
          jurisdiction:
            rule.jurisdiction,
          workerCategory:
            rule.workerCategory,
          currency:
            rule.currency,
          effectiveFrom:
            rule.effectiveFrom,
          effectiveTo:
            rule.effectiveTo,
          standardWeeklyHours:
            rule.standardWeeklyHours,
          weeklyRate:
            rule.weeklyRate,
          hourlyRate:
            rule.hourlyRate,
          calculationSettings:
            rule.calculationSettings,
          sourceName:
            rule.sourceName,
          sourceUrl:
            rule.sourceUrl,
          sourceReference:
            rule.sourceReference,
          sourceVerifiedAt:
            rule.sourceVerifiedAt,
        },
        attendancePeriodNumber:
          String(
            attendancePeriodNumber ||
              ""
          ).trim(),
        assessedAt: new Date(),
      };
    }

    const minimumGrossPay =
      roundMoney(
        safeWorkedHours *
          Number(
            rule.hourlyRate || 0
          )
      );

    const shortfall =
      roundMoney(
        Math.max(
          0,
          minimumGrossPay -
            assessedGrossPay
        )
      );

    const compliant =
      shortfall <= 0;

    return {
      applicable: true,
      workerCategory,
      hourlyRate:
        roundMoney(
          rule.hourlyRate
        ),
      weeklyRate:
        roundMoney(
          rule.weeklyRate
        ),
      standardWeeklyHours:
        roundHours(
          rule.standardWeeklyHours
        ),
      workedHours:
        safeWorkedHours,
      minimumGrossPay,
      assessedGrossPay,
      shortfall,
      compliant,
      assessmentStatus:
        compliant
          ? "Compliant"
          : "Non-Compliant",
      warning: compliant
        ? ""
        : `Minimum-wage shortfall of JMD ${shortfall.toFixed(
            2
          )} must be resolved before payroll approval.`,
      ruleId: rule._id,
      ruleCode:
        rule.ruleCode,
      ruleSnapshot: {
        ruleCode:
          rule.ruleCode,
        name: rule.name,
        jurisdiction:
          rule.jurisdiction,
        workerCategory:
          rule.workerCategory,
        currency:
          rule.currency,
        effectiveFrom:
          rule.effectiveFrom,
        effectiveTo:
          rule.effectiveTo,
        standardWeeklyHours:
          rule.standardWeeklyHours,
        weeklyRate:
          rule.weeklyRate,
        hourlyRate:
          rule.hourlyRate,
        calculationSettings:
          rule.calculationSettings,
        sourceName:
          rule.sourceName,
        sourceUrl:
          rule.sourceUrl,
        sourceReference:
          rule.sourceReference,
        sourceVerifiedAt:
          rule.sourceVerifiedAt,
      },
      attendancePeriodNumber:
        String(
          attendancePeriodNumber ||
            ""
        ).trim(),
      assessedAt: new Date(),
    };
  };

module.exports = {
  resolveMinimumWageRule,
  buildMinimumWageAssessment,
};