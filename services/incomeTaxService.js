const IncomeTaxRule = require("../models/IncomeTaxRule");

const {
  getBusinessEntityForDate,
  getBusinessEntitySnapshot,
} = require("./businessEntityService");

const roundMoney = (value) =>
  Math.round(
    (Number(value || 0) + Number.EPSILON) * 100
  ) / 100;

const normalizeDate = (value, fieldName = "Date") => {
  if (!value) {
    throw new Error(`${fieldName} is required.`);
  }

  const text = String(value).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(
      `${fieldName} must use YYYY-MM-DD format.`
    );
  }

  const date = new Date(`${text}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return date;
};

const getIncomeTaxRuleForEntity = async ({
  entity,
  calculationDate,
}) => {
  if (!entity) {
    throw new Error(
      "A business entity is required to resolve an income-tax rule."
    );
  }

  const incomeTaxType =
    entity.taxTreatment?.incomeTaxType;

  if (
    ![
      "Individual Income Tax",
      "Company Income Tax",
    ].includes(incomeTaxType)
  ) {
    throw new Error(
      `${entity.entityCode} does not have a configured income-tax type.`
    );
  }

  const date = normalizeDate(
    calculationDate,
    "Calculation date"
  );

  const rule = await IncomeTaxRule.findOne({
    countryCode: "JM",
    incomeTaxType,
    applicableEntityTypes: entity.entityType,
    status: "Active",
    effectiveFrom: { $lte: date },
    $or: [
      { effectiveTo: null },
      { effectiveTo: { $gte: date } },
    ],
  }).sort({
    effectiveFrom: -1,
  });

  if (!rule) {
    throw new Error(
      `No active ${incomeTaxType} rule is configured for ${entity.entityCode} on ${String(
        calculationDate
      ).slice(0, 10)}.`
    );
  }

  return rule;
};

const calculateProgressiveTax = ({
  chargeableIncome,
  rateBands,
}) => {
  let tax = 0;

  const orderedBands = [...(rateBands || [])].sort(
    (a, b) =>
      Number(a.lowerBound || 0) -
      Number(b.lowerBound || 0)
  );

  for (const band of orderedBands) {
    const lowerBound = Number(
      band.lowerBound || 0
    );

    const upperBound =
      band.upperBound === null ||
      band.upperBound === undefined
        ? null
        : Number(band.upperBound);

    const taxableInBand =
      upperBound === null
        ? Math.max(
            0,
            chargeableIncome - lowerBound
          )
        : Math.max(
            0,
            Math.min(chargeableIncome, upperBound) -
              lowerBound
          );

    tax += taxableInBand * Number(band.rate || 0);
  }

  return roundMoney(tax);
};

const calculateIncomeTaxEstimate = async ({
  periodStart,
  periodEnd,
  grossRevenue = 0,
  costOfSales = 0,
  operatingExpenses = 0,
  otherIncome = 0,
  nonDeductibleExpenses = 0,
  exemptIncome = 0,
  capitalAllowances = 0,
  lossCarryForwardApplied = 0,
  otherAddBacks = 0,
  otherDeductions = 0,
  taxCredits = 0,
  priorPayments = 0,
  manualTaxAmount = 0,
}) => {
  const normalizedPeriodStart = normalizeDate(
    periodStart,
    "Period start"
  );

  const normalizedPeriodEnd = normalizeDate(
    periodEnd,
    "Period end"
  );

  if (normalizedPeriodEnd < normalizedPeriodStart) {
    throw new Error(
      "The income-tax period end cannot be earlier than its start."
    );
  }

  const entity = await getBusinessEntityForDate(
    periodEnd,
    {
      includeRegistered: true,
      includePlanned: false,
    }
  );

  const rule = await getIncomeTaxRuleForEntity({
    entity,
    calculationDate: periodEnd,
  });

  const revenue = roundMoney(grossRevenue);
  const cogs = roundMoney(costOfSales);
  const expenses = roundMoney(operatingExpenses);
  const additionalIncome = roundMoney(otherIncome);

  const grossProfit = roundMoney(revenue - cogs);

  const accountingProfit = roundMoney(
    grossProfit - expenses + additionalIncome
  );

  const adjustedIncome = roundMoney(
    accountingProfit +
      Number(nonDeductibleExpenses || 0) +
      Number(otherAddBacks || 0) -
      Number(exemptIncome || 0) -
      Number(capitalAllowances || 0) -
      Number(lossCarryForwardApplied || 0) -
      Number(otherDeductions || 0)
  );

  const estimatedTaxableIncome = Math.max(
    0,
    adjustedIncome
  );

  const chargeableIncome = Math.max(
    0,
    roundMoney(
      estimatedTaxableIncome -
        Number(rule.annualThreshold || 0)
    )
  );

  let grossIncomeTax = 0;

  if (rule.calculationMethod === "Progressive") {
    grossIncomeTax = calculateProgressiveTax({
      chargeableIncome,
      rateBands: rule.rateBands,
    });
  }

  if (rule.calculationMethod === "Flat Rate") {
    grossIncomeTax = roundMoney(
      chargeableIncome * Number(rule.flatRate || 0)
    );
  }

  if (
    rule.calculationMethod === "Manual Assessment"
  ) {
    grossIncomeTax = Math.max(
      0,
      roundMoney(manualTaxAmount)
    );
  }

  const normalizedTaxCredits = Math.max(
    0,
    roundMoney(taxCredits)
  );

  const normalizedPriorPayments = Math.max(
    0,
    roundMoney(priorPayments)
  );

  const estimatedTaxDue = Math.max(
    0,
    roundMoney(
      grossIncomeTax -
        normalizedTaxCredits -
        normalizedPriorPayments
    )
  );

  return {
    entity,
    entitySnapshot:
      getBusinessEntitySnapshot(entity),

    incomeTaxType:
      entity.taxTreatment.incomeTaxType,

    rule,
    ruleSnapshot: {
      ruleCode: rule.ruleCode,
      name: rule.name,
      incomeTaxType: rule.incomeTaxType,
      applicableEntityTypes:
        rule.applicableEntityTypes,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      filingFrequency: rule.filingFrequency,
      calculationMethod:
        rule.calculationMethod,
      currency: rule.currency,
      annualThreshold: rule.annualThreshold,
      flatRate: rule.flatRate,
      rateBands: JSON.parse(
        JSON.stringify(rule.rateBands || [])
      ),
      calculationSettings: JSON.parse(
        JSON.stringify(
          rule.calculationSettings || {}
        )
      ),
      sourceName: rule.sourceName,
      sourceUrl: rule.sourceUrl,
      sourceReference: rule.sourceReference,
      sourceVerifiedAt: rule.sourceVerifiedAt,
    },

    periodStart: normalizedPeriodStart,
    periodEnd: normalizedPeriodEnd,

    financialSummary: {
      grossRevenue: revenue,
      costOfSales: cogs,
      grossProfit,
      operatingExpenses: expenses,
      otherIncome: additionalIncome,
      accountingProfit,
    },

    taxAdjustments: {
      nonDeductibleExpenses: Math.max(
        0,
        roundMoney(nonDeductibleExpenses)
      ),
      exemptIncome: Math.max(
        0,
        roundMoney(exemptIncome)
      ),
      capitalAllowances: Math.max(
        0,
        roundMoney(capitalAllowances)
      ),
      lossCarryForwardApplied: Math.max(
        0,
        roundMoney(lossCarryForwardApplied)
      ),
      otherAddBacks: Math.max(
        0,
        roundMoney(otherAddBacks)
      ),
      otherDeductions: Math.max(
        0,
        roundMoney(otherDeductions)
      ),
    },

    estimatedTaxableIncome,
    chargeableIncome,
    grossIncomeTax,
    taxCredits: normalizedTaxCredits,
    priorPayments: normalizedPriorPayments,
    estimatedTaxDue,
    balanceDue: estimatedTaxDue,
  };
};

module.exports = {
  roundMoney,
  normalizeDate,
  getIncomeTaxRuleForEntity,
  calculateProgressiveTax,
  calculateIncomeTaxEstimate,
};