const IncomeTaxRule = require("../models/IncomeTaxRule");

const {
  calculateIncomeTaxEstimate,
} = require("../services/incomeTaxService");

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const getIncomeTaxRules = async (req, res) => {
  try {
    const query = {};

    if (req.query.status) {
      query.status = String(req.query.status).trim();
    }

    if (req.query.incomeTaxType) {
      query.incomeTaxType = String(
        req.query.incomeTaxType
      ).trim();
    }

    const rules = await IncomeTaxRule.find(query).sort({
      effectiveFrom: -1,
      ruleCode: 1,
    });

    res.json({
      success: true,
      message:
        "Income-tax rules retrieved successfully",
      totalRecords: rules.length,
      data: rules,
    });
  } catch (error) {
    console.error(
      "Get income-tax rules error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not retrieve income-tax rules",
      error: error.message,
    });
  }
};

const createIncomeTaxRule = async (req, res) => {
  try {
    const {
      ruleCode,
      name,
      incomeTaxType,
      applicableEntityTypes,
      effectiveFrom,
      effectiveTo,
      filingFrequency,
      calculationMethod,
      currency,
      annualThreshold,
      flatRate,
      rateBands,
      calculationSettings,
      sourceName,
      sourceUrl,
      sourceReference,
      sourceVerifiedAt,
      notes,
    } = req.body;

    if (
      !ruleCode ||
      !name ||
      !incomeTaxType ||
      !effectiveFrom ||
      !calculationMethod
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Rule code, name, income-tax type, effective-from date, and calculation method are required.",
      });
    }

    if (
      !Array.isArray(applicableEntityTypes) ||
      applicableEntityTypes.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one applicable entity type is required.",
      });
    }

    const normalizedRuleCode = String(ruleCode)
      .trim()
      .toUpperCase();

    const existingRule =
      await IncomeTaxRule.findOne({
        ruleCode: normalizedRuleCode,
      });

    if (existingRule) {
      return res.status(409).json({
        success: false,
        message: `Income-tax rule ${normalizedRuleCode} already exists.`,
      });
    }

    const rule = await IncomeTaxRule.create({
      ruleCode: normalizedRuleCode,
      countryCode: "JM",
      name: String(name).trim(),
      incomeTaxType,
      applicableEntityTypes,
      effectiveFrom,
      effectiveTo: effectiveTo || null,
      filingFrequency:
        filingFrequency || "Annual",
      calculationMethod,
      currency: currency || "JMD",
      annualThreshold: Number(
        annualThreshold || 0
      ),
      flatRate: Number(flatRate || 0),
      rateBands: Array.isArray(rateBands)
        ? rateBands
        : [],
      calculationSettings:
        calculationSettings || undefined,
      sourceName: String(
        sourceName || ""
      ).trim(),
      sourceUrl: String(sourceUrl || "").trim(),
      sourceReference: String(
        sourceReference || ""
      ).trim(),
      sourceVerifiedAt:
        sourceVerifiedAt || null,
      notes: String(notes || "").trim(),
      status: "Draft",
      createdBy: getUserName(req.user),
      updatedBy: getUserName(req.user),
    });

    res.status(201).json({
      success: true,
      message:
        "Draft income-tax rule created successfully",
      data: rule,
    });
  } catch (error) {
    console.error(
      "Create income-tax rule error:",
      error
    );

    const statusCode =
      error.name === "ValidationError" ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      message:
        statusCode === 400
          ? error.message
          : "Could not create income-tax rule",
      error: error.message,
    });
  }
};

const updateDraftIncomeTaxRule = async (
  req,
  res
) => {
  try {
    const { ruleCode } = req.params;

    const rule = await IncomeTaxRule.findOne({
      ruleCode: String(ruleCode)
        .trim()
        .toUpperCase(),
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Income-tax rule not found",
      });
    }

    if (rule.status !== "Draft") {
      return res.status(409).json({
        success: false,
        message:
          "Only Draft income-tax rules may be edited.",
      });
    }

    const protectedFields = [
      "_id",
      "ruleCode",
      "countryCode",
      "status",
      "createdBy",
      "createdAt",
    ];

    protectedFields.forEach((field) => {
      delete req.body[field];
    });

    Object.assign(rule, req.body, {
      updatedBy: getUserName(req.user),
    });

    await rule.save();

    res.json({
      success: true,
      message:
        "Draft income-tax rule updated successfully",
      data: rule,
    });
  } catch (error) {
    console.error(
      "Update income-tax rule error:",
      error
    );

    const statusCode =
      error.name === "ValidationError" ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      message:
        statusCode === 400
          ? error.message
          : "Could not update income-tax rule",
      error: error.message,
    });
  }
};

const activateIncomeTaxRule = async (
  req,
  res
) => {
  try {
    const { ruleCode } = req.params;

    const rule = await IncomeTaxRule.findOne({
      ruleCode: String(ruleCode)
        .trim()
        .toUpperCase(),
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Income-tax rule not found",
      });
    }

    if (rule.status !== "Draft") {
      return res.status(409).json({
        success: false,
        message:
          "Only a Draft income-tax rule may be activated.",
      });
    }

    if (
      !rule.sourceName ||
      (!rule.sourceUrl &&
        !rule.sourceReference) ||
      !rule.sourceVerifiedAt
    ) {
      return res.status(400).json({
        success: false,
        message:
          "An income-tax rule cannot be activated until its source name, source URL or reference, and verification date are recorded.",
      });
    }

    if (
      !Array.isArray(
        rule.applicableEntityTypes
      ) ||
      rule.applicableEntityTypes.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one applicable entity type is required before activation.",
      });
    }

    if (
      rule.calculationMethod === "Flat Rate" &&
      Number(rule.flatRate || 0) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A positive flat rate is required before a Flat Rate rule can be activated.",
      });
    }

    if (
      rule.calculationMethod ===
        "Progressive" &&
      (!Array.isArray(rule.rateBands) ||
        rule.rateBands.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one rate band is required before a Progressive rule can be activated.",
      });
    }

    const overlap =
      await IncomeTaxRule.findOne({
        _id: { $ne: rule._id },
        countryCode: rule.countryCode,
        incomeTaxType: rule.incomeTaxType,
        applicableEntityTypes: {
          $in: rule.applicableEntityTypes,
        },
        status: "Active",
        effectiveFrom: {
          $lte:
            rule.effectiveTo ||
            new Date("9999-12-31T23:59:59.999Z"),
        },
        $or: [
          { effectiveTo: null },
          {
            effectiveTo: {
              $gte: rule.effectiveFrom,
            },
          },
        ],
      });

    if (overlap) {
      return res.status(409).json({
        success: false,
        message: `Income-tax rule ${rule.ruleCode} overlaps active rule ${overlap.ruleCode}.`,
      });
    }

    rule.status = "Active";
    rule.updatedBy = getUserName(req.user);

    await rule.save();

    res.json({
      success: true,
      message: `${rule.ruleCode} activated successfully.`,
      data: rule,
    });
  } catch (error) {
    console.error(
      "Activate income-tax rule error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not activate income-tax rule",
      error: error.message,
    });
  }
};

const previewIncomeTaxEstimate = async (
  req,
  res
) => {
  try {
    const {
      periodStart,
      periodEnd,
      grossRevenue,
      costOfSales,
      operatingExpenses,
      otherIncome,
      nonDeductibleExpenses,
      exemptIncome,
      capitalAllowances,
      lossCarryForwardApplied,
      otherAddBacks,
      otherDeductions,
      taxCredits,
      priorPayments,
      manualTaxAmount,
    } = req.body;

    if (!periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        message:
          "Period start and period end are required.",
      });
    }

    const calculation =
      await calculateIncomeTaxEstimate({
        periodStart,
        periodEnd,
        grossRevenue,
        costOfSales,
        operatingExpenses,
        otherIncome,
        nonDeductibleExpenses,
        exemptIncome,
        capitalAllowances,
        lossCarryForwardApplied,
        otherAddBacks,
        otherDeductions,
        taxCredits,
        priorPayments,
        manualTaxAmount,
      });

    res.json({
      success: true,
      message:
        "Income-tax estimate preview calculated successfully. No estimate or tax liability was created.",
      data: {
        entitySnapshot:
          calculation.entitySnapshot,
        incomeTaxType:
          calculation.incomeTaxType,
        ruleSnapshot:
          calculation.ruleSnapshot,
        periodStart:
          calculation.periodStart,
        periodEnd: calculation.periodEnd,
        financialSummary:
          calculation.financialSummary,
        taxAdjustments:
          calculation.taxAdjustments,
        estimatedTaxableIncome:
          calculation.estimatedTaxableIncome,
        chargeableIncome:
          calculation.chargeableIncome,
        grossIncomeTax:
          calculation.grossIncomeTax,
        taxCredits: calculation.taxCredits,
        priorPayments:
          calculation.priorPayments,
        estimatedTaxDue:
          calculation.estimatedTaxDue,
        balanceDue: calculation.balanceDue,
      },
    });
  } catch (error) {
    console.error(
      "Preview income-tax estimate error:",
      error
    );

    const statusCode =
      /No effective business entity|No active .* rule|does not have a configured income-tax type/i.test(
        error.message
      )
        ? 409
        : 400;

    res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};


module.exports = {
  getIncomeTaxRules,
  createIncomeTaxRule,
  updateDraftIncomeTaxRule,
  activateIncomeTaxRule,
  previewIncomeTaxEstimate,
};