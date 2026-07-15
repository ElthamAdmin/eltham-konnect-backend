const PayrollStatutoryRule = require("../models/PayrollStatutoryRule");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const DEFAULT_SOURCE_URLS = [
  "https://mlss.gov.jm/departments/national-insurance-scheme/",
  "https://www.nht.gov.jm/employer-contribution",
  "https://www.heart-nsta.org/contributions/",
  "https://jis.gov.jm/increase-in-income-tax-threshold-now-in-effect/",
];

const DEFAULT_RULES = [
  {
    ruleCode: "JM-2026-JAN-MAR",
    countryCode: "JM",
    name: "Jamaica Payroll Rules - January to March 2026",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-03-31T23:59:59.999Z"),
    employeeRates: { nis: 0.03, nht: 0.02, educationTax: 0.0225 },
    employerRates: { nis: 0.03, nht: 0.03, educationTax: 0.035, heart: 0.03 },
    nisAnnualWageCeiling: 5000000,
    payeThresholds: {
      annual: 1799376,
      monthly: 149948,
      fortnightly: 69307.26,
      weekly: 34603,
    },
    payeRates: {
      standard: 0.25,
      upper: 0.3,
      upperBandAnnualIncome: 6000000,
    },
    calculationSettings: {
      deductNisFromStatutoryIncome: true,
      deductApprovedPensionFromStatutoryIncome: true,
      educationTaxUsesStatutoryIncome: true,
      nhtUsesGrossPay: true,
      heartUsesGrossPay: true,
    },
    sourceNotes:
      "2026 pre-April PAYE threshold with current Jamaican statutory contribution rates.",
    sourceUrls: DEFAULT_SOURCE_URLS,
    status: "Active",
  },
  {
    ruleCode: "JM-2026-APR-DEC",
    countryCode: "JM",
    name: "Jamaica Payroll Rules - April to December 2026",
    effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-12-31T23:59:59.999Z"),
    employeeRates: { nis: 0.03, nht: 0.02, educationTax: 0.0225 },
    employerRates: { nis: 0.03, nht: 0.03, educationTax: 0.035, heart: 0.03 },
    nisAnnualWageCeiling: 5000000,
    payeThresholds: {
      annual: 1902360,
      monthly: 158530,
      fortnightly: 73234.9,
      weekly: 36583.85,
    },
    payeRates: {
      standard: 0.25,
      upper: 0.3,
      upperBandAnnualIncome: 6000000,
    },
    calculationSettings: {
      deductNisFromStatutoryIncome: true,
      deductApprovedPensionFromStatutoryIncome: true,
      educationTaxUsesStatutoryIncome: true,
      nhtUsesGrossPay: true,
      heartUsesGrossPay: true,
    },
    sourceNotes:
      "PAYE threshold effective April 1, 2026. Full calendar-year blended threshold is JMD 1,876,614.",
    sourceUrls: DEFAULT_SOURCE_URLS,
    status: "Active",
  },
];

const ensureDefaultPayrollRules = async () => {
  for (const rule of DEFAULT_RULES) {
    await PayrollStatutoryRule.findOneAndUpdate(
      { ruleCode: rule.ruleCode },
      { $setOnInsert: rule },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
};

const normalizePayrollDate = (value) => {
  if (!value) return new Date();

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("A valid payroll date or pay period is required.");
    }
    return value;
  }

  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}$/.test(text) ? `${text}-01` : text;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}T12:00:00.000Z`)
    : new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error("A valid payroll date or pay period is required.");
  }

  return date;
};

const getStatutoryRuleForDate = async (dateValue) => {
  await ensureDefaultPayrollRules();
  const payrollDate = normalizePayrollDate(dateValue);

  const rule = await PayrollStatutoryRule.findOne({
    countryCode: "JM",
    status: "Active",
    effectiveFrom: { $lte: payrollDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: payrollDate } }],
  }).sort({ effectiveFrom: -1 });

  if (!rule) {
    throw new Error(
      `No active Jamaican Payroll statutory rule exists for ${payrollDate
        .toISOString()
        .slice(0, 10)}.`
    );
  }

  return rule;
};

const getFrequencySettings = (rule, payFrequency) => {
  const frequency = String(payFrequency || "Monthly").toLowerCase();

  if (frequency === "weekly") {
    return { divisor: 52, threshold: rule.payeThresholds.weekly };
  }

  if (frequency === "fortnightly" || frequency === "biweekly") {
    return { divisor: 26, threshold: rule.payeThresholds.fortnightly };
  }

  if (frequency === "semi-monthly") {
    return { divisor: 24, threshold: rule.payeThresholds.annual / 24 };
  }

  if (frequency === "annual") {
    return { divisor: 1, threshold: rule.payeThresholds.annual };
  }

  return { divisor: 12, threshold: rule.payeThresholds.monthly };
};

const calculatePaye = ({
  statutoryIncome,
  threshold,
  upperBandPeriodicIncome,
  standardRate,
  upperRate,
}) => {
  const chargeableIncome = Math.max(
    0,
    roundMoney(statutoryIncome - Number(threshold || 0))
  );

  const standardBandCapacity = Math.max(
    0,
    roundMoney(upperBandPeriodicIncome - Number(threshold || 0))
  );
  const standardBandIncome = Math.min(chargeableIncome, standardBandCapacity);
  const upperBandIncome = Math.max(
    0,
    roundMoney(chargeableIncome - standardBandIncome)
  );

  return {
    chargeableIncome,
    standardBandIncome,
    upperBandIncome,
    incomeTax: roundMoney(
      standardBandIncome * standardRate + upperBandIncome * upperRate
    ),
  };
};

const calculateJamaicanPayroll = async ({
  grossPay,
  pensionEmployee = 0,
  payPeriod,
  payDate,
  payFrequency = "Monthly",
}) => {
  const gross = roundMoney(grossPay);
  const pension = Math.max(0, roundMoney(pensionEmployee));

  if (gross <= 0) {
    throw new Error("Gross pay must be greater than zero.");
  }

  if (pension > gross) {
    throw new Error("Employee pension cannot exceed gross pay.");
  }

  const payrollDate = normalizePayrollDate(payDate || payPeriod);
  const rule = await getStatutoryRuleForDate(payrollDate);
  const frequency = getFrequencySettings(rule, payFrequency);
  const nisPeriodicCeiling = roundMoney(
    rule.nisAnnualWageCeiling / frequency.divisor
  );
  const nisInsurablePay = Math.min(gross, nisPeriodicCeiling);
  const nisEmployee = roundMoney(
    nisInsurablePay * rule.employeeRates.nis
  );
  const nisEmployer = roundMoney(
    nisInsurablePay * rule.employerRates.nis
  );

  const statutoryIncome = Math.max(
    0,
    roundMoney(
      gross -
        (rule.calculationSettings.deductNisFromStatutoryIncome
          ? nisEmployee
          : 0) -
        (rule.calculationSettings.deductApprovedPensionFromStatutoryIncome
          ? pension
          : 0)
    )
  );

  const educationTaxBase = rule.calculationSettings
    .educationTaxUsesStatutoryIncome
    ? statutoryIncome
    : gross;
  const nhtBase = rule.calculationSettings.nhtUsesGrossPay
    ? gross
    : statutoryIncome;
  const heartBase = rule.calculationSettings.heartUsesGrossPay
    ? gross
    : statutoryIncome;

  const nhtEmployee = roundMoney(nhtBase * rule.employeeRates.nht);
  const educationTaxEmployee = roundMoney(
    educationTaxBase * rule.employeeRates.educationTax
  );
  const nhtEmployer = roundMoney(nhtBase * rule.employerRates.nht);
  const educationTaxEmployer = roundMoney(
    educationTaxBase * rule.employerRates.educationTax
  );
  const heartEmployer = roundMoney(heartBase * rule.employerRates.heart);

  const paye = calculatePaye({
    statutoryIncome,
    threshold: frequency.threshold,
    upperBandPeriodicIncome:
      rule.payeRates.upperBandAnnualIncome / frequency.divisor,
    standardRate: rule.payeRates.standard,
    upperRate: rule.payeRates.upper,
  });

  const totalEmployeeDeductions = roundMoney(
    nisEmployee +
      nhtEmployee +
      educationTaxEmployee +
      paye.incomeTax +
      pension
  );
  const totalEmployerContributions = roundMoney(
    nisEmployer + nhtEmployer + educationTaxEmployer + heartEmployer
  );

  if (totalEmployeeDeductions > gross) {
    throw new Error("Employee deductions cannot exceed gross pay.");
  }

  return {
    grossPay: gross,
    payFrequency,
    statutoryIncome,
    chargeableIncome: paye.chargeableIncome,
    nisInsurablePay,
    nisEmployee,
    nhtEmployee,
    educationTax: educationTaxEmployee,
    incomeTax: paye.incomeTax,
    pensionEmployee: pension,
    totalEmployeeDeductions,
    totalDeductions: totalEmployeeDeductions,
    netPay: roundMoney(gross - totalEmployeeDeductions),
    nisEmployer,
    nhtEmployer,
    educationTaxEmployer,
    heartEmployer,
    totalEmployerContributions,
    totalPayrollCost: roundMoney(gross + totalEmployerContributions),
    statutoryRuleId: rule._id,
    statutoryRuleCode: rule.ruleCode,
    statutoryRuleEffectiveFrom: rule.effectiveFrom,
    statutoryRuleSnapshot: {
      ruleCode: rule.ruleCode,
      name: rule.name,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      employeeRates: JSON.parse(JSON.stringify(rule.employeeRates)),
      employerRates: JSON.parse(JSON.stringify(rule.employerRates)),
      nisAnnualWageCeiling: rule.nisAnnualWageCeiling,
      payeThresholds: JSON.parse(JSON.stringify(rule.payeThresholds)),
      payeRates: JSON.parse(JSON.stringify(rule.payeRates)),
      calculationSettings: JSON.parse(
        JSON.stringify(rule.calculationSettings)
      ),
    },
  };
};

module.exports = {
  calculateJamaicanPayroll,
  ensureDefaultPayrollRules,
  getStatutoryRuleForDate,
  normalizePayrollDate,
  roundMoney,
};