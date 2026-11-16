const IncomeTaxRule = require("../models/IncomeTaxRule");
const IncomeTaxEstimate = require("../models/IncomeTaxEstimate");
const TaxRecord = require("../models/TaxRecord");
const JournalEntry = require("../models/JournalEntry");

const {
  postIncomeTaxAssessment,
} = require("../services/accountingService");

const {
  calculateIncomeTaxEstimate,
} = require("../services/incomeTaxService");

const T = require("../services/taxControl");

const {
  transact,
} = require("../services/taxTransactionService");

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const S = require("../services/taxScopeService");

const {
  assertEntityPeriodTaxTypeReconciled,
} = require(
  "../services/taxEntityPeriodReconciliationService"
);

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

const incomeTaxInputFields = [
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

const buildIncomeTaxInputs = (body) => {
  const inputs = {
    entityCode: T.text(
      body.entityCode,
      "Business entity"
    ).toUpperCase(),

    periodStart: T.date(
      body.periodStart,
      "Period start"
    ),

    periodEnd: T.date(
      body.periodEnd,
      "Period end"
    ),
  };

  for (const field of incomeTaxInputFields) {
    if (body[field] !== undefined) {
      inputs[field] = T.amount(
        body[field],
        field
      );
    }
  }

  return inputs;
};

const incomeTaxPeriodKey = (
  body,
  calculation
) => {
  const start = calculation.periodStart
    .toISOString()
    .slice(0, 10);

  const end = calculation.periodEnd
    .toISOString()
    .slice(0, 10);

  const frequency =
    calculation.rule.filingFrequency;

  if (
    frequency === "Monthly" &&
    start.slice(0, 7) !==
      end.slice(0, 7)
  ) {
    T.fail(
      "A monthly income-tax estimate must fall within one calendar month."
    );
  }

  const expectedKey =
    frequency === "Annual"
      ? end.slice(0, 4)
      : end.slice(0, 7);

  if (
    body.periodKey !== undefined &&
    T.text(
      body.periodKey,
      "Reporting period"
    ) !== expectedKey
  ) {
    T.fail(
      `The reporting period must be ${expectedKey} for these dates and this rule's filing frequency.`
    );
  }

  return expectedKey;
};

const incomeTaxCalculationView = (
  calculation,
  periodKey
) => ({
  entityCode:
    calculation.entity.entityCode,

  entitySnapshot:
    calculation.entitySnapshot,

  incomeTaxType:
    calculation.incomeTaxType,

  periodKey,

  periodStart:
    calculation.periodStart,

  periodEnd:
    calculation.periodEnd,

  filingFrequency:
    calculation.rule.filingFrequency,

  incomeTaxRuleCode:
    calculation.rule.ruleCode,

  ruleSnapshot:
    calculation.ruleSnapshot,

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

  taxCredits:
    calculation.taxCredits,

  priorPayments:
    calculation.priorPayments,

  estimatedTaxDue:
    calculation.estimatedTaxDue,

  balanceDue:
    calculation.balanceDue,

  notice:
    "Calculated from the supplied financial summary. Source completeness, deduction eligibility, and credit evidence still require review.",
});

const previewIncomeTaxEstimate = T.handler(
  async (req, res) => {
    const body = req.body || {};

    const inputs =
      buildIncomeTaxInputs(body);

    const calculation =
      await calculateIncomeTaxEstimate(
        inputs
      );

    const periodKey =
      incomeTaxPeriodKey(
        body,
        calculation
      );

    return res.json({
      success: true,

      message:
        "Income-tax preview generated. No estimate or accounting entry was saved.",

      data: incomeTaxCalculationView(
        calculation,
        periodKey
      ),
    });
  }
);

const getIncomeTaxEstimates = T.handler(
  async (req, res) => {
    const entityCode = T.text(
      req.query.entityCode,
      "Business entity"
    ).toUpperCase();

    const periodKey = T.text(
      req.query.periodKey,
      "Reporting period"
    );

    const query = {
      entityCode,
    };

    if (/^\d{4}$/.test(periodKey)) {
      T.date(
        `${periodKey}-01-01`,
        "Reporting year"
      );

      query.periodKey = periodKey;
    } else {
      T.period(periodKey);

      query.periodKey = {
        $in: [
          periodKey,
          periodKey.slice(0, 4),
        ],
      };
    }

    if (req.query.status) {
      query.status = T.text(
        req.query.status,
        "Estimate status"
      );
    }

    const estimates =
      await IncomeTaxEstimate.find(
        query
      )
        .sort({
          periodEnd: -1,
          createdAt: -1,
        })
        .lean();

    return res.json({
      success: true,

      message:
        "Income-tax estimates retrieved successfully.",

      filters: {
        entityCode,
        periodKey,
      },

      notice:
        "A monthly selection also includes annual estimates for that year. Each estimate retains its own reporting period.",

      totalRecords:
        estimates.length,

      data: estimates,
    });
  }
);

const createIncomeTaxEstimate = T.handler(
  async (req, res) => {
    const body = req.body || {};

    const inputs =
      buildIncomeTaxInputs(body);

    const notes = T.text(
      body.notes ?? "",
      "Notes",
      false
    );

    const adjustmentNotes = T.text(
      body.adjustmentNotes ?? "",
      "Adjustment notes",
      false
    );

    const dueDate = body.dueDate
      ? new Date(
          `${T.date(
            body.dueDate,
            "Due date"
          )}T12:00:00.000Z`
        )
      : null;

    const data = await transact(
      async (session) => {
        const calculation =
          await calculateIncomeTaxEstimate({
            ...inputs,
            session,
          });

        const periodKey =
          incomeTaxPeriodKey(
            body,
            calculation
          );

        const existing =
          await IncomeTaxEstimate.findOne({
            entityCode:
              calculation.entity
                .entityCode,

            incomeTaxType:
              calculation.incomeTaxType,

            periodKey,
          }).session(session);

        if (existing) {
          T.fail(
            `Estimate ${existing.estimateNumber} already exists for this business, tax type, and period.`,
            409
          );
        }

        const userName =
          T.actor(req);

        const calculatedAt =
          new Date();

        const [estimate] =
          await IncomeTaxEstimate.create(
            [
              {
                estimateNumber:
                  T.number("ITX"),

                entityId:
                  calculation.entity
                    ._id,

                entityCode:
                  calculation.entity
                    .entityCode,

                entitySnapshot:
                  calculation
                    .entitySnapshot,

                incomeTaxType:
                  calculation
                    .incomeTaxType,

                periodKey,

                periodStart:
                  calculation
                    .periodStart,

                periodEnd:
                  calculation
                    .periodEnd,

                filingFrequency:
                  calculation.rule
                    .filingFrequency,

                calculationMode:
                  calculation.rule
                    .calculationMethod ===
                  "Manual Assessment"
                    ? "Manual Assessment"
                    : "System Calculated",

                incomeTaxRuleId:
                  calculation.rule
                    ._id,

                incomeTaxRuleCode:
                  calculation.rule
                    .ruleCode,

                ruleSnapshot:
                  calculation
                    .ruleSnapshot,

                financialSummary:
                  calculation
                    .financialSummary,

                taxAdjustments: {
                  ...calculation
                    .taxAdjustments,

                  adjustmentNotes,
                },

                estimatedTaxableIncome:
                  calculation
                    .estimatedTaxableIncome,

                grossIncomeTax:
                  calculation
                    .grossIncomeTax,

                taxCredits:
                  calculation
                    .taxCredits,

                priorPayments:
                  calculation
                    .priorPayments,

                estimatedTaxDue:
                  calculation
                    .estimatedTaxDue,

                amountPaid: 0,

                balanceDue:
                  calculation
                    .balanceDue,

                dueDate,

                calculationSnapshot: {
                  source:
                    "Manual Financial Summary",

                  calculatedAt,

                  requestInputs: inputs,

                  result:
                    incomeTaxCalculationView(
                      calculation,
                      periodKey
                    ),
                },

                calculatedBy:
                  userName,

                calculatedAt,

                status: "Calculated",

                workflowHistory: [
                  {
                    fromStatus: "",

                    toStatus:
                      "Calculated",

                    action:
                      "Calculate",

                    notes:
                      "Created from the supplied financial summary using the business's assigned rule.",

                    performedBy:
                      userName,

                    performedAt:
                      calculatedAt,
                  },
                ],

                notes,

                createdBy:
                  userName,

                updatedBy:
                  userName,
              },
            ],
            { session }
          );

        await writeAuditLog({
          req,
          session,

          action:
            "CREATE_INCOME_TAX_ESTIMATE",

          module: "Tax Center",

          description:
            `Created ${estimate.estimateNumber}`,

          targetType:
            "IncomeTaxEstimate",

          targetId:
            estimate.estimateNumber,

          afterValues:
            estimate.toObject(),
        });

        return estimate;
      }
    );

    return res.status(201).json({
      success: true,

      message:
        "Income-tax estimate saved for review. No assessment journal or tax obligation was posted.",

      data,
    });
  }
);

const transitionIncomeTaxEstimate = T.handler(
  async (req, res) => {
    const body = req.body || {};

    const estimateNumber = T.text(
      req.params.estimateNumber,
      "Estimate number"
    ).toUpperCase();

    const action = T.text(
      body.action,
      "Workflow action"
    ).toLowerCase();

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
          "Draft",
          "Calculated",
          "Reviewed",
          "Approved",
        ],
        to: "Cancelled",
      },
    };

    const transition =
      transitions[action];

    if (!transition) {
      T.fail(
        "Action must be Review, Approve, Submit, Reconcile, or Cancel."
      );
    }

    const notes = T.text(
      body.notes ?? "",
      "Workflow notes",
      false
    );

    const data = await transact(
      async (session) => {
        const estimate =
          await IncomeTaxEstimate.findOne({
            estimateNumber,
          }).session(session);

        if (!estimate) {
          T.fail(
            "Income-tax estimate not found.",
            404
          );
        }

        if (
          !transition.from.includes(
            estimate.status
          )
        ) {
          T.fail(
            `${estimateNumber} cannot ${action} while its status is ${estimate.status}.`,
            409
          );
        }

        const beforeValues =
          estimate.toObject();

        const userName =
          T.actor(req);

        const now = new Date();

        const start = new Date(
          estimate.periodStart
        )
          .toISOString()
          .slice(0, 10);

        const end = new Date(
          estimate.periodEnd
        )
          .toISOString()
          .slice(0, 10);

        const entity =
          await S.resolve(
            estimate.entityCode,
            start,
            end,
            session
          );

        if (
          String(estimate.entityId) !==
            String(entity._id) ||
          estimate.entitySnapshot
            ?.entityCode !==
            entity.entityCode
        ) {
          T.fail(
            "Estimate business attribution is inconsistent.",
            409
          );
        }

        const taxDue = T.amount(
          estimate.estimatedTaxDue,
          "Estimated tax due"
        );

        const amountPaid = T.amount(
          estimate.amountPaid,
          "Amount paid"
        );

        const balanceDue = T.amount(
          estimate.balanceDue,
          "Balance due"
        );

        if (
          amountPaid > taxDue ||
          T.round(
            taxDue - amountPaid
          ) !== balanceDue
        ) {
          T.fail(
            "Estimate balances are inconsistent.",
            409
          );
        }

        if (
          ["review", "approve", "submit"]
            .includes(action)
        ) {
          const savedResult =
            estimate.calculationSnapshot
              ?.result;

          if (
            !savedResult ||
            savedResult.entityCode !==
              estimate.entityCode ||
            savedResult.incomeTaxRuleCode !==
              estimate.incomeTaxRuleCode
          ) {
            T.fail(
              "This estimate lacks a matching controlled calculation snapshot and requires historical review.",
              409
            );
          }

          for (const field of [
            "estimatedTaxableIncome",
            "grossIncomeTax",
            "taxCredits",
            "priorPayments",
            "estimatedTaxDue",
          ]) {
            if (
              T.amount(
                savedResult[field],
                `Saved ${field}`
              ) !==
              T.amount(
                estimate[field],
                field
              )
            ) {
              T.fail(
                "Estimate amounts differ from its saved calculation. Review the estimate before continuing.",
                409
              );
            }
          }

          if (
            JSON.stringify(
              savedResult.financialSummary
            ) !==
            JSON.stringify(
              estimate.financialSummary
                ?.toObject
                ? estimate.financialSummary
                    .toObject()
                : estimate.financialSummary
            )
          ) {
            T.fail(
              "The financial summary differs from the saved calculation.",
              409
            );
          }
        }

        if (action === "review") {
          estimate.reviewedBy =
            userName;

          estimate.reviewedAt = now;
          estimate.reviewNotes = notes;
        }

        if (action === "approve") {
          estimate.approvedBy =
            userName;

          estimate.approvedAt = now;
          estimate.approvalNotes = notes;
        }

        if (action === "cancel") {
          if (
            estimate.taxRecordId ||
            estimate.taxNumber ||
            estimate.assessmentJournalEntryNumber ||
            amountPaid > 0
          ) {
            T.fail(
              "An estimate linked to accounting or payments cannot be cancelled here.",
              409
            );
          }

          if (!notes) {
            T.fail(
              "A cancellation reason is required."
            );
          }
        }

        if (action === "submit") {
          if (
            estimate.taxRecordId ||
            estimate.taxNumber ||
            estimate.assessmentJournalEntryNumber
          ) {
            T.fail(
              "This estimate already has submission or accounting links. Review them before retrying.",
              409
            );
          }

          if (
            T.amount(
              estimate.taxCredits,
              "Tax credits"
            ) > 0 ||
            T.amount(
              estimate.priorPayments,
              "Prior payments"
            ) > 0
          ) {
            T.fail(
              "This estimate includes credits or prior payments. A reviewed accounting allocation is required before posting; none will be inferred.",
              409
            );
          }

          if (amountPaid !== 0) {
            T.fail(
              "An unsubmitted estimate cannot already contain payments.",
              409
            );
          }

          const existingObligation =
            await TaxRecord.findOne({
              sourceType:
                "Income Tax Estimate",

              sourceReference:
                estimate.estimateNumber,
            }).session(session);

          const existingJournal =
            await JournalEntry.findOne({
              reference:
                estimate.estimateNumber,

              sourceModule:
                "Tax Center",
            }).session(session);

          if (
            existingObligation ||
            existingJournal
          ) {
            T.fail(
              "Existing assessment records require review. No duplicate was posted.",
              409
            );
          }

          const filingReference =
            T.text(
              body.filingReference,
              "Filing reference"
            );

          const filingMethod =
            T.text(
              body.filingMethod,
              "Filing method"
            );

          const taxRecordMethods = {
            Online: "TAJ Online",
            Manual:
              "Manual Submission",
            "Tax Authority Assessment":
              "Other",
            Other: "Other",
          };

          if (
            !taxRecordMethods[
              filingMethod
            ]
          ) {
            T.fail(
              "Filing method must be Online, Manual, Tax Authority Assessment, or Other."
            );
          }

          const filedDate = T.date(
            body.filedDate,
            "Filed date"
          );

          if (
            filedDate > T.today()
          ) {
            T.fail(
              "Filed date cannot be in the future."
            );
          }

          const taxType =
            estimate.incomeTaxType ===
              "Company Income Tax"
              ? "Company Tax"
              : estimate.incomeTaxType ===
                  "Individual Income Tax"
                ? "Income Tax"
                : null;

          if (!taxType) {
            T.fail(
              "Unsupported estimate income-tax type.",
              409
            );
          }

          let journal = null;

          if (taxDue > 0) {
            journal =
              await postIncomeTaxAssessment({
                estimate,
                user: req.user,
                session,
              });

            if (
              !journal?.entryNumber
            ) {
              T.fail(
                "The assessment journal was not created.",
                409
              );
            }
          }

          const [taxRecord] =
            await TaxRecord.create(
              [
                {
                  taxNumber:
                    T.number("TAX-ITX"),

                  entityId:
                    estimate.entityId,

                  entityCode:
                    estimate.entityCode,

                  entitySnapshot:
                    estimate.entitySnapshot,

                  businessType:
                    estimate.entitySnapshot
                      .entityType,

                  businessName:
                    estimate.entitySnapshot
                      .legalName,

                  businessTrn:
                    estimate.entitySnapshot
                      .trn || "",

                  taxType,
                  taxCategory:
                    "Income Tax",

                  periodKey:
                    estimate.periodKey,

                  periodStart: start,
                  periodEnd: end,

                  filingFrequency:
                    estimate.filingFrequency,

                  sourceType:
                    "Income Tax Estimate",

                  sourceModule:
                    "Tax Center",

                  sourceReference:
                    estimate.estimateNumber,

                  taxableAmount:
                    estimate
                      .estimatedTaxableIncome,

                  taxRate: 0,
                  taxDue,
                  amountPaid: 0,
                  balanceDue: taxDue,

                  dueDate:
                    estimate.dueDate
                      ? new Date(
                          estimate.dueDate
                        )
                          .toISOString()
                          .slice(0, 10)
                      : "",

                  status:
                    "Submitted",

                  filingReference,

                  filingMethod:
                    taxRecordMethods[
                      filingMethod
                    ],

                  filedDate,

                  reviewedBy:
                    estimate.reviewedBy,

                  reviewedAt:
                    estimate.reviewedAt,

                  approvedBy:
                    estimate.approvedBy,

                  approvedAt:
                    estimate.approvedAt,

                  submittedBy:
                    userName,

                  submittedAt: now,

                  journalEntryNumber:
                    journal?.entryNumber ||
                    "",

                  ledgerReference:
                    journal?.entryNumber ||
                    "",

                  calculationSnapshot:
                    estimate.calculationSnapshot,

                  notes:
                    `Submitted from ${estimate.estimateNumber}. ${notes}`,

                  createdBy:
                    userName,

                  updatedBy:
                    userName,
                },
              ],
              { session }
            );

          estimate.taxRecordId =
            taxRecord._id;

          estimate.taxNumber =
            taxRecord.taxNumber;

          estimate.filingReference =
            filingReference;

          estimate.filingMethod =
            filingMethod;

          estimate.filedDate =
            new Date(
              `${filedDate}T12:00:00.000Z`
            );

          estimate.submittedBy =
            userName;

          estimate.submittedAt =
            now;

          if (journal) {
            estimate.assessmentJournalEntryNumber =
              journal.entryNumber;

            estimate.assessmentPostedAt =
              now;

            estimate.assessmentPostedBy =
              userName;
          }

          await writeAuditLog({
            req,
            session,

            action:
              "CREATE_INCOME_TAX_OBLIGATION",

            module: "Tax Center",

            description:
              `Created ${taxRecord.taxNumber} from ${estimateNumber}`,

            targetType:
              "TaxRecord",

            targetId:
              taxRecord.taxNumber,

            afterValues:
              taxRecord.toObject(),

            journalEntryNumber:
              journal?.entryNumber ||
              "",
          });
        }

        if (action === "reconcile") {
          if (
            balanceDue !== 0 ||
            !estimate.filingReference ||
            !estimate.submittedAt ||
            !estimate.taxRecordId
          ) {
            T.fail(
              "Reconciliation requires a zero balance, filing evidence, and a linked tax obligation.",
              409
            );
          }

          const taxRecord =
            await TaxRecord.findById(
              estimate.taxRecordId
            ).session(session);

          if (
            !taxRecord ||
            taxRecord.entityCode !==
              estimate.entityCode ||
            taxRecord.periodKey !==
              estimate.periodKey ||
            taxRecord.taxNumber !==
              estimate.taxNumber ||
            T.amount(
              taxRecord.taxDue
            ) !== taxDue ||
            T.amount(
              taxRecord.amountPaid
            ) !== amountPaid ||
            T.amount(
              taxRecord.balanceDue
            ) !== 0 ||
            taxRecord.status !==
              "Reconciled"
          ) {
            T.fail(
              "Reconcile the matching tax obligation first. Its balances and business must agree with this estimate.",
              409
            );
          }

          await assertEntityPeriodTaxTypeReconciled({
            entityCode:
              taxRecord.entityCode,

            periodKey:
              taxRecord.periodKey,

            taxType:
              taxRecord.taxType,

            session,
          });

          estimate.reconciledBy =
            userName;

          estimate.reconciledAt =
            now;

          estimate.reconciliationNotes =
            notes;
        }

        estimate.status =
          transition.to;

        estimate.updatedBy =
          userName;

        estimate.workflowHistory.push({
          fromStatus:
            beforeValues.status,

          toStatus:
            estimate.status,

          action,
          notes,

          performedBy:
            userName,

          performedAt: now,
        });

        await estimate.save({
          session,
        });

        await writeAuditLog({
          req,
          session,

          action:
            `INCOME_TAX_${action.toUpperCase()}`,

          module: "Tax Center",

          description:
            `${action}: ${estimateNumber}`,

          targetType:
            "IncomeTaxEstimate",

          targetId:
            estimateNumber,

          beforeValues,

          afterValues:
            estimate.toObject(),
        });

        return estimate;
      }
    );

    return res.json({
      success: true,

      message:
        `Income-tax estimate ${action} completed.`,

      data,
    });
  }
);

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