const IncomeTaxRule = require(
  "../models/IncomeTaxRule"
);

const T = require("./taxControl");
const S = require("./taxScopeService");

const roundMoney = T.round;

const normalizeDate = (
  value,
  label = "Date"
) =>
  new Date(
    `${T.date(value, label)}T12:00:00.000Z`
  );

const validateRate = (
  value,
  label = "Tax rate"
) => {
  if (
    !["number", "string"].includes(
      typeof value
    ) ||
    (
      typeof value === "string" &&
      !value.trim()
    )
  ) {
    T.fail(
      `${label} must be a decimal between 0 and 1.`,
      409
    );
  }

  const rate = Number(value);

  if (
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 1
  ) {
    T.fail(
      `${label} must be a decimal between 0 and 1.`,
      409
    );
  }

  return rate;
};

const validateBands = (bands) => {
  if (
    !Array.isArray(bands) ||
    bands.length === 0
  ) {
    T.fail(
      "A progressive rule requires rate bands.",
      409
    );
  }

  const rows = bands
    .map((band) => ({
      lowerBound: T.amount(
        band.lowerBound,
        "Band lower bound"
      ),

      upperBound:
        band.upperBound === null ||
        band.upperBound === undefined
          ? null
          : T.amount(
              band.upperBound,
              "Band upper bound"
            ),

      rate: validateRate(
        band.rate,
        "Band rate"
      ),
    }))
    .sort(
      (first, second) =>
        first.lowerBound -
        second.lowerBound
    );

  let expectedLowerBound = 0;

  for (
    let index = 0;
    index < rows.length;
    index += 1
  ) {
    const band = rows[index];

    if (
      band.lowerBound !==
      expectedLowerBound
    ) {
      T.fail(
        "Progressive bands must start at zero and continue without gaps or overlaps.",
        409
      );
    }

    if (band.upperBound === null) {
      if (
        index !== rows.length - 1
      ) {
        T.fail(
          "Only the final progressive band may be open-ended.",
          409
        );
      }
    } else if (
      band.upperBound <=
      band.lowerBound
    ) {
      T.fail(
        "Each band upper bound must exceed its lower bound.",
        409
      );
    }

    expectedLowerBound =
      band.upperBound;
  }

  if (
    rows[rows.length - 1]
      .upperBound !== null
  ) {
    T.fail(
      "The final progressive band must be open-ended.",
      409
    );
  }

  return rows;
};

const calculateProgressiveTax = ({
  chargeableIncome,
  rateBands,
}) => {
  const income = T.amount(
    chargeableIncome,
    "Chargeable income"
  );

  const bands =
    validateBands(rateBands);

  let tax = 0;

  for (const band of bands) {
    const upperBound =
      band.upperBound ?? income;

    const taxableInBand =
      Math.max(
        0,
        Math.min(
          income,
          upperBound
        ) - band.lowerBound
      );

    tax +=
      taxableInBand * band.rate;
  }

  return roundMoney(tax);
};

const getIncomeTaxRuleForEntity = async ({
  entity,
  calculationDate,
  periodStart = calculationDate,
  session = null,
}) => {
  if (!entity) {
    T.fail(
      "A business entity is required.",
      409
    );
  }

  const start = T.date(
    periodStart,
    "Rule coverage start"
  );

  const end = T.date(
    calculationDate,
    "Rule coverage end"
  );

  if (end < start) {
    T.fail(
      "Rule coverage end cannot precede its start."
    );
  }

  const ruleCode =
    entity.taxTreatment
      ?.incomeTaxRuleCode;

  const expectedType = {
    "Sole Proprietorship":
      "Individual Income Tax",

    "Limited Liability Company":
      "Company Income Tax",
  }[entity.entityType];

  if (
    !expectedType ||
    entity.taxTreatment
      ?.incomeTaxType !==
      expectedType ||
    !ruleCode
  ) {
    T.fail(
      "Assign a matching income-tax type and reviewed rule to this business first.",
      409
    );
  }

  const rule =
    await IncomeTaxRule.findOne({
      ruleCode,
      countryCode: "JM",
      currency: "JMD",
      status: "Active",

      incomeTaxType:
        expectedType,

      applicableEntityTypes:
        entity.entityType,
    }).session(session);

  if (!rule) {
    T.fail(
      "The assigned Active JMD income-tax rule does not match this business.",
      409
    );
  }

  if (
    !rule.sourceName?.trim() ||
    (
      !rule.sourceUrl?.trim() &&
      !rule.sourceReference?.trim()
    ) ||
    !rule.sourceVerifiedAt
  ) {
    T.fail(
      "The assigned income-tax rule requires verified source information.",
      409
    );
  }

  const effectiveFrom =
    new Date(rule.effectiveFrom);

  const effectiveTo =
    rule.effectiveTo
      ? new Date(
          rule.effectiveTo
        )
      : null;

  if (
    !Number.isFinite(
      effectiveFrom.getTime()
    ) ||
    (
      effectiveTo &&
      !Number.isFinite(
        effectiveTo.getTime()
      )
    )
  ) {
    T.fail(
      "The assigned rule has invalid effective dates.",
      409
    );
  }

  if (
    effectiveFrom
      .toISOString()
      .slice(0, 10) > start ||
    (
      effectiveTo &&
      effectiveTo
        .toISOString()
        .slice(0, 10) < end
    )
  ) {
    T.fail(
      "The assigned income-tax rule must cover the complete estimate period.",
      409
    );
  }

  return rule;
};

const calculateIncomeTaxEstimate = async (
  input
) => {
  const start = T.date(
    input.periodStart,
    "Period start"
  );

  const end = T.date(
    input.periodEnd,
    "Period end"
  );

  if (end < start) {
    T.fail(
      "Period end cannot precede period start."
    );
  }

  const session =
    input.session || null;

  const entity = await S.resolve(
    input.entityCode,
    start,
    end,
    session,
    true
  );

  const rule =
    await getIncomeTaxRuleForEntity({
      entity,
      periodStart: start,
      calculationDate: end,
      session,
    });

  const fields = [
    "grossRevenue",
    "costOfSales",
    "operatingExpenses",
    "otherIncome",
    "nonDeductibleExpenses",
    "exemptIncome",
    "capitalAllowances",
    "lossCarryForwardApplied",
    "otherAddBacks",
    "otherDeductions",
    "taxCredits",
    "priorPayments",
    "manualTaxAmount",
  ];

  const values = {};

  for (const field of fields) {
    values[field] = T.amount(
      input[field] ?? 0,
      field
    );
  }

  const settings =
    rule.calculationSettings || {};

  if (
    settings.allowBusinessExpenses ===
      false &&
    (
      values.costOfSales > 0 ||
      values.operatingExpenses > 0
    )
  ) {
    T.fail(
      "This rule does not allow business-expense deductions."
    );
  }

  if (
    settings.includeOtherIncome ===
      false &&
    values.otherIncome > 0
  ) {
    T.fail(
      "This rule does not include other income."
    );
  }

  if (
    settings.allowCapitalAllowances !==
      true &&
    values.capitalAllowances > 0
  ) {
    T.fail(
      "Capital allowances are not enabled by this rule."
    );
  }

  if (
    values.lossCarryForwardApplied > 0
  ) {
    T.fail(
      "Loss carry-forward requires separately verified loss history. This calculation does not infer eligibility.",
      409
    );
  }

  const startDate =
    normalizeDate(start);

  const endDate =
    normalizeDate(end);

  const elapsedDays =
    (endDate - startDate) /
    86400000;

  const fullFiscalYear =
    start.slice(5) ===
      (
        entity.fiscalYearStart ||
        "01-01"
      ) &&
    end.slice(5) ===
      (
        entity.fiscalYearEnd ||
        "12-31"
      ) &&
    (
      elapsedDays === 364 ||
      elapsedDays === 365
    );

  const annualThreshold =
    T.amount(
      rule.annualThreshold ?? 0,
      "Annual threshold"
    );

  if (
    rule.calculationMethod !==
      "Manual Assessment" &&
    !fullFiscalYear &&
    (
      rule.filingFrequency ===
        "Annual" ||
      annualThreshold > 0
    )
  ) {
    T.fail(
      "This partial-year estimate requires a reviewed Manual Assessment rule. Annual thresholds and rates are not prorated automatically.",
      409
    );
  }

  const grossProfit =
    roundMoney(
      values.grossRevenue -
        values.costOfSales
    );

  const accountingProfit =
    roundMoney(
      grossProfit -
        values.operatingExpenses +
        values.otherIncome
    );

  const estimatedTaxableIncome =
    Math.max(
      0,
      roundMoney(
        accountingProfit +
          values.nonDeductibleExpenses +
          values.otherAddBacks -
          values.exemptIncome -
          values.capitalAllowances -
          values.lossCarryForwardApplied -
          values.otherDeductions
      )
    );

  const chargeableIncome =
    Math.max(
      0,
      roundMoney(
        estimatedTaxableIncome -
          annualThreshold
      )
    );

  let grossIncomeTax;

  if (
    rule.calculationMethod ===
    "Progressive"
  ) {
    grossIncomeTax =
      calculateProgressiveTax({
        chargeableIncome,
        rateBands: rule.rateBands,
      });
  } else if (
    rule.calculationMethod ===
    "Flat Rate"
  ) {
    const rate = validateRate(
      rule.flatRate,
      "Flat rate"
    );

    if (rate === 0) {
      T.fail(
        "A Flat Rate rule requires a positive rate.",
        409
      );
    }

    grossIncomeTax =
      roundMoney(
        chargeableIncome * rate
      );
  } else if (
    rule.calculationMethod ===
    "Manual Assessment"
  ) {
    if (
      input.manualTaxAmount ===
        undefined ||
      input.manualTaxAmount === null
    ) {
      T.fail(
        "A reviewed manual tax amount is required."
      );
    }

    grossIncomeTax =
      values.manualTaxAmount;
  } else {
    T.fail(
      "Unsupported income-tax calculation method.",
      409
    );
  }

  const estimatedTaxDue =
    Math.max(
      0,
      roundMoney(
        grossIncomeTax -
          values.taxCredits -
          values.priorPayments
      )
    );

  const taxAdjustments = {};

  for (const field of [
    "nonDeductibleExpenses",
    "exemptIncome",
    "capitalAllowances",
    "lossCarryForwardApplied",
    "otherAddBacks",
    "otherDeductions",
  ]) {
    taxAdjustments[field] =
      values[field];
  }

  return {
    entity,

    entitySnapshot:
      S.snapshot(entity),

    incomeTaxType:
      entity.taxTreatment
        .incomeTaxType,

    rule,

    ruleSnapshot:
      JSON.parse(
        JSON.stringify(
          rule.toObject()
        )
      ),

    periodStart: startDate,
    periodEnd: endDate,

    financialSummary: {
      grossRevenue:
        values.grossRevenue,

      costOfSales:
        values.costOfSales,

      grossProfit,

      operatingExpenses:
        values.operatingExpenses,

      otherIncome:
        values.otherIncome,

      accountingProfit,
    },

    taxAdjustments,
    estimatedTaxableIncome,
    chargeableIncome,
    grossIncomeTax,

    taxCredits:
      values.taxCredits,

    priorPayments:
      values.priorPayments,

    estimatedTaxDue,
    balanceDue: estimatedTaxDue,
  };
};

module.exports = {
  roundMoney,
  normalizeDate,
  validateBands,
  getIncomeTaxRuleForEntity,
  calculateProgressiveTax,
  calculateIncomeTaxEstimate,
};