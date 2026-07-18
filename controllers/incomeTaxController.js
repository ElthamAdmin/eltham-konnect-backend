const IncomeTaxRule = require("../models/IncomeTaxRule");
const IncomeTaxEstimate = require("../models/IncomeTaxEstimate");
const TaxRecord = require("../models/TaxRecord");

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

const getIncomeTaxEstimates = async (
  req,
  res
) => {
  try {
    const query = {};

    if (req.query.entityCode) {
      query.entityCode = String(
        req.query.entityCode
      )
        .trim()
        .toUpperCase();
    }

    if (req.query.periodKey) {
      query.periodKey = String(
        req.query.periodKey
      ).trim();
    }

    if (req.query.status) {
      query.status = String(
        req.query.status
      ).trim();
    }

    const estimates =
      await IncomeTaxEstimate.find(query).sort({
        periodEnd: -1,
        createdAt: -1,
      });

    res.json({
      success: true,
      message:
        "Income-tax estimates retrieved successfully",
      totalRecords: estimates.length,
      data: estimates,
    });
  } catch (error) {
    console.error(
      "Get income-tax estimates error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not retrieve income-tax estimates",
      error: error.message,
    });
  }
};

const createIncomeTaxEstimate = async (
  req,
  res
) => {
  try {
    const {
      periodKey,
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
      adjustmentNotes,
      taxCredits,
      priorPayments,
      manualTaxAmount,
      dueDate,
      notes,
    } = req.body;

    if (!periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        message:
          "Period start and period end are required.",
      });
    }

    const normalizedPeriodKey = String(
      periodKey ||
        String(periodEnd).slice(0, 4)
    ).trim();

    if (!normalizedPeriodKey) {
      return res.status(400).json({
        success: false,
        message:
          "A valid income-tax period key is required.",
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

    const existingEstimate =
      await IncomeTaxEstimate.findOne({
        entityCode:
          calculation.entity.entityCode,
        incomeTaxType:
          calculation.incomeTaxType,
        periodKey: normalizedPeriodKey,
      });

    if (existingEstimate) {
      return res.status(409).json({
        success: false,
        message: `${calculation.entity.entityCode} already has income-tax estimate ${existingEstimate.estimateNumber} for ${normalizedPeriodKey}.`,
        data: {
          existingEstimateNumber:
            existingEstimate.estimateNumber,
          existingStatus:
            existingEstimate.status,
        },
      });
    }

    const estimateNumber = `ITX-${
      calculation.entity.entityCode
    }-${normalizedPeriodKey}-${Date.now()}`;

    const userName = getUserName(req.user);
    const calculatedAt = new Date();

    const estimate =
      await IncomeTaxEstimate.create({
        estimateNumber,
        entityId: calculation.entity._id,
        entityCode:
          calculation.entity.entityCode,
        entitySnapshot:
          calculation.entitySnapshot,
        incomeTaxType:
          calculation.incomeTaxType,
        periodKey: normalizedPeriodKey,
        periodStart:
          calculation.periodStart,
        periodEnd: calculation.periodEnd,
        filingFrequency:
          calculation.rule.filingFrequency,
        calculationMode:
          calculation.rule
            .calculationMethod ===
          "Manual Assessment"
            ? "Manual Assessment"
            : "System Calculated",
        incomeTaxRuleId:
          calculation.rule._id,
        incomeTaxRuleCode:
          calculation.rule.ruleCode,
        ruleSnapshot:
          calculation.ruleSnapshot,
        financialSummary:
          calculation.financialSummary,
        taxAdjustments: {
          ...calculation.taxAdjustments,
          adjustmentNotes: String(
            adjustmentNotes || ""
          ).trim(),
        },
        estimatedTaxableIncome:
          calculation.estimatedTaxableIncome,
        grossIncomeTax:
          calculation.grossIncomeTax,
        taxCredits:
          calculation.taxCredits,
        priorPayments:
          calculation.priorPayments,
        estimatedTaxDue:
          calculation.estimatedTaxDue,
        amountPaid: 0,
        balanceDue:
          calculation.balanceDue,
        dueDate: dueDate || null,
        calculationSnapshot: {
          calculatedAt,
          source: "Manual Financial Summary",
          requestInputs: {
            grossRevenue: Number(
              grossRevenue || 0
            ),
            costOfSales: Number(
              costOfSales || 0
            ),
            operatingExpenses: Number(
              operatingExpenses || 0
            ),
            otherIncome: Number(
              otherIncome || 0
            ),
            nonDeductibleExpenses: Number(
              nonDeductibleExpenses || 0
            ),
            exemptIncome: Number(
              exemptIncome || 0
            ),
            capitalAllowances: Number(
              capitalAllowances || 0
            ),
            lossCarryForwardApplied: Number(
              lossCarryForwardApplied || 0
            ),
            otherAddBacks: Number(
              otherAddBacks || 0
            ),
            otherDeductions: Number(
              otherDeductions || 0
            ),
            taxCredits: Number(
              taxCredits || 0
            ),
            priorPayments: Number(
              priorPayments || 0
            ),
          },
        },
        calculatedBy: userName,
        calculatedAt,
        status: "Calculated",
        workflowHistory: [
          {
            fromStatus: "",
            toStatus: "Calculated",
            action:
              "Income-tax estimate calculated",
            notes:
              "Estimate created from the supplied financial summary.",
            performedBy: userName,
            performedAt: calculatedAt,
          },
        ],
        notes: String(notes || "").trim(),
        createdBy: userName,
        updatedBy: userName,
      });

    res.status(201).json({
      success: true,
      message:
        "Income-tax estimate created successfully. No TaxRecord or accounting liability was created.",
      data: estimate,
    });
  } catch (error) {
    console.error(
      "Create income-tax estimate error:",
      error
    );

    const statusCode =
      error.code === 11000
        ? 409
        : /No effective business entity|No active .* rule/i.test(
              error.message
            )
          ? 409
          : 400;

    res.status(statusCode).json({
      success: false,
      message:
        error.code === 11000
          ? "An income-tax estimate already exists for this entity and period."
          : error.message,
    });
  }
};

const transitionIncomeTaxEstimate = async (
  req,
  res
) => {
  try {
    const { estimateNumber } = req.params;

    const {
      action,
      notes,
      filingReference,
      filingMethod,
      filedDate,
    } = req.body;

    const normalizedAction = String(
      action || ""
    )
      .trim()
      .toLowerCase();

    const estimate =
      await IncomeTaxEstimate.findOne({
        estimateNumber: String(
          estimateNumber || ""
        )
          .trim()
          .toUpperCase(),
      });

    if (!estimate) {
      return res.status(404).json({
        success: false,
        message:
          "Income-tax estimate not found",
      });
    }

    const transitions = {
      review: {
        from: ["Calculated"],
        to: "Reviewed",
      },

      approve: {
        from: ["Reviewed"],
        to: "Approved",
      },

      submit: {
        from: ["Approved"],
        to: "Submitted",
      },

      reconcile: {
        from: ["Submitted", "Paid"],
        to: "Reconciled",
      },

      cancel: {
        from: [
          "Calculated",
          "Reviewed",
          "Approved",
        ],
        to: "Cancelled",
      },
    };

    const transition =
      transitions[normalizedAction];

    if (!transition) {
      return res.status(400).json({
        success: false,
        message:
          "Action must be Review, Approve, Submit, Reconcile, or Cancel.",
      });
    }

    if (
      !transition.from.includes(estimate.status)
    ) {
      return res.status(409).json({
        success: false,
        message: `${estimate.estimateNumber} cannot be ${normalizedAction}ed while its status is ${estimate.status}.`,
      });
    }

    if (
      normalizedAction === "submit" &&
      !String(filingReference || "").trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A filing reference is required before an income-tax estimate can be submitted.",
      });
    }

    if (
      normalizedAction === "reconcile" &&
      Number(estimate.balanceDue || 0) > 0 &&
      estimate.status !== "Paid"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "An income-tax estimate with an outstanding balance must be paid before reconciliation.",
      });
    }

    const userName = getUserName(req.user);
    const now = new Date();
    const previousStatus = estimate.status;

    if (normalizedAction === "review") {
      estimate.reviewedBy = userName;
      estimate.reviewedAt = now;
      estimate.reviewNotes = String(
        notes || ""
      ).trim();
    }

    if (normalizedAction === "approve") {
      estimate.approvedBy = userName;
      estimate.approvedAt = now;
      estimate.approvalNotes = String(
        notes || ""
      ).trim();
    }

    if (normalizedAction === "submit") {
      estimate.filingReference = String(
        filingReference
      ).trim();

      estimate.filingMethod =
        filingMethod || "Online";

      estimate.filedDate = filedDate
        ? new Date(
            `${String(filedDate).slice(
              0,
              10
            )}T12:00:00.000Z`
          )
        : now;

      estimate.submittedBy = userName;
      estimate.submittedAt = now;

      let taxRecord = null;

      if (estimate.taxRecordId) {
        taxRecord = await TaxRecord.findById(
          estimate.taxRecordId
        );
      }

      if (!taxRecord) {
        const effectiveTaxRate =
          Number(
            estimate.estimatedTaxableIncome ||
              0
          ) > 0
            ? Number(
                (
                  (Number(
                    estimate.grossIncomeTax ||
                      0
                  ) /
                    Number(
                      estimate.estimatedTaxableIncome
                    )) *
                  100
                ).toFixed(6)
              )
            : 0;

        taxRecord = await TaxRecord.create({
          taxNumber: `TAX-ITX-${
            estimate.entityCode
          }-${estimate.periodKey}-${Date.now()}`,
          taxType: "Income Tax",
          periodStart: new Date(
            estimate.periodStart
          )
            .toISOString()
            .slice(0, 10),
          periodEnd: new Date(
            estimate.periodEnd
          )
            .toISOString()
            .slice(0, 10),
          taxableAmount: Number(
            estimate.estimatedTaxableIncome ||
              0
          ),
          taxRate: effectiveTaxRate,
          taxDue: Number(
            estimate.estimatedTaxDue || 0
          ),
          amountPaid: Number(
            estimate.amountPaid || 0
          ),
          balanceDue: Number(
            estimate.balanceDue || 0
          ),
          dueDate: estimate.dueDate
            ? new Date(estimate.dueDate)
                .toISOString()
                .slice(0, 10)
            : "",
          status: "Submitted",
          filingReference:
            estimate.filingReference,
          notes: `Income-tax filing for ${estimate.entityCode}, period ${estimate.periodKey}. Estimate ${estimate.estimateNumber}. ${String(
            notes || ""
          ).trim()}`,
        });

        estimate.taxRecordId =
          taxRecord._id;

        estimate.taxNumber =
          taxRecord.taxNumber;
      }
    }

    if (normalizedAction === "reconcile") {
      estimate.reconciledBy = userName;
      estimate.reconciledAt = now;
      estimate.reconciliationNotes =
        String(notes || "").trim();

      if (estimate.taxRecordId) {
        await TaxRecord.findByIdAndUpdate(
          estimate.taxRecordId,
          {
            $set: {
              status: "Reconciled",
              reconciliationNotes:
                estimate.reconciliationNotes,
            },
          },
          {
            runValidators: true,
          }
        );
      }
    }

    estimate.status = transition.to;
    estimate.updatedBy = userName;

    estimate.workflowHistory.push({
      fromStatus: previousStatus,
      toStatus: transition.to,
      action: `Income-tax estimate ${normalizedAction}`,
      notes: String(notes || "").trim(),
      performedBy: userName,
      performedAt: now,
    });

    await estimate.save();

    res.json({
      success: true,
      message: `${estimate.estimateNumber} moved from ${previousStatus} to ${estimate.status} successfully.`,
      data: estimate,
    });
  } catch (error) {
    console.error(
      "Income-tax workflow error:",
      error
    );

    const statusCode =
      error.name === "ValidationError"
        ? 400
        : 500;

    res.status(statusCode).json({
      success: false,
      message:
        statusCode === 400
          ? error.message
          : "Could not update the income-tax estimate workflow",
      error: error.message,
    });
  }
};




module.exports = {
  getIncomeTaxRules,
  createIncomeTaxRule,
  updateDraftIncomeTaxRule,
  activateIncomeTaxRule,
  previewIncomeTaxEstimate,
  getIncomeTaxEstimates,
createIncomeTaxEstimate,
transitionIncomeTaxEstimate,
};