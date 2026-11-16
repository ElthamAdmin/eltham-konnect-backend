const TaxRecord = require("../models/TaxRecord");
const Payroll = require("../models/Payroll");
const Expense = require("../models/Expense");
const Invoice = require("../models/Invoice");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const ChartOfAccount = require(
  "../models/ChartOfAccount"
);

const IncomeTaxEstimate = require(
  "../models/IncomeTaxEstimate"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const T = require("../services/taxControl");

const S = require(
  "../services/taxScopeService"
);

const {
  transact,
  hash,
} = require(
  "../services/taxTransactionService"
);
const TaxDeadlineRule = require("../models/TaxDeadlineRule");
const TaxRegistrationProfile = require("../models/TaxRegistrationProfile");
const GctFilingPeriod = require("../models/GctFilingPeriod");

const {
  postTaxLiabilityPayment,
  postGctFilingSettlement,
} = require("../services/accountingService");

const {
  applyDeadlineRuleToRecord,
} = require("../services/taxDeadlineService");

const {
  assertEntityPeriodTaxTypeReconciled,
} = require("../services/taxEntityPeriodReconciliationService");

const {
  generateGctTurnoverMonitor,
} = require("../services/gctMonitoringService");

const {
  generateGctFilingPeriod,
  getGctRegister,
} = require("../services/gctFilingService");

const JournalEntry = require("../models/JournalEntry");

const GctRegisterEntry = require("../models/GctRegisterEntry");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");
const BusinessEntity = require("../models/BusinessEntity");

const ACTIVE_PAYROLL_STATUSES = ["Approved", "Paid"];
const PAY_PERIOD_PATTERN = /^\d{4}-\d{2}$/;

const TAX_WORKFLOW_ACTIONS = {
  Review: {
    fromStatus: "Calculated",
    toStatus: "Reviewed",
  },

  Approve: {
    fromStatus: "Reviewed",
    toStatus: "Approved",
  },

  Submit: {
    fromStatus: "Approved",
    toStatus: "Submitted",
  },

    Reconcile: {
    fromStatus: "Paid",
    toStatus: "Reconciled",
  },
};

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const getPeriodDates = (payPeriod) => {
  if (!PAY_PERIOD_PATTERN.test(String(payPeriod || ""))) {
    throw new Error("Pay period must use YYYY-MM format.");
  }

  const [year, month] = String(payPeriod).split("-").map(Number);

  const periodStart = `${payPeriod}-01`;
  const periodEnd = new Date(Date.UTC(year, month, 0))
    .toISOString()
    .slice(0, 10);

  return {
    periodKey: payPeriod,
    periodStart,
    periodEnd,
  };
};

const getTaxCategory = (taxType) => {
  if (
    [
      "PAYE",
      "NIS",
      "NHT",
      "Education Tax",
      "HEART",
      "Pension",
    ].includes(taxType)
  ) {
    return "Payroll Statutory";
  }

  if (taxType === "GCT") {
    return "Consumption Tax";
  }

  if (
    [
      "Income Tax",
      "Individual Income Tax",
      "Company Tax",
      "Company Income Tax",
    ].includes(taxType)
  ) {
    return "Income Tax";
  }

  return "Other";
};

const getPayrollQuery = (payPeriod = "") => {
  const query = {
    status: {
      $in: ACTIVE_PAYROLL_STATUSES,
    },
  };

  if (payPeriod) {
    query.payPeriod = payPeriod;
  }

  return query;
};

const calculatePayrollLiabilities = (payrolls = []) => {
  const totals = payrolls.reduce(
    (sum, payroll) => {
      sum.grossPay += Number(payroll.grossPay || 0);

      sum.nisEmployee += Number(payroll.nisEmployee || 0);
      sum.nisEmployer += Number(payroll.nisEmployer || 0);

      sum.nhtEmployee += Number(payroll.nhtEmployee || 0);
      sum.nhtEmployer += Number(payroll.nhtEmployer || 0);

      sum.educationTaxEmployee += Number(payroll.educationTax || 0);
      sum.educationTaxEmployer += Number(
        payroll.educationTaxEmployer || 0
      );

      sum.paye += Number(payroll.incomeTax || 0);
      sum.heartEmployer += Number(payroll.heartEmployer || 0);

      sum.pensionEmployee += Number(payroll.pensionEmployee || 0);
      sum.pensionEmployer += Number(payroll.pensionEmployer || 0);

      sum.totalEmployeeDeductions += Number(
        payroll.totalDeductions || 0
      );

      sum.totalEmployerContributions += Number(
        payroll.totalEmployerContributions || 0
      );

      sum.netPayBeforeAdvance += Number(
        payroll.netPayBeforeAdvance ??
          Number(payroll.grossPay || 0) -
            Number(payroll.totalDeductions || 0)
      );

      sum.advanceRecovery += Number(payroll.advanceRecovery || 0);
      sum.netPay += Number(payroll.netPay || 0);
      sum.totalPayrollCost += Number(
        payroll.totalPayrollCost ||
          Number(payroll.grossPay || 0) +
            Number(payroll.totalEmployerContributions || 0)
      );

      return sum;
    },
    {
      grossPay: 0,

      nisEmployee: 0,
      nisEmployer: 0,

      nhtEmployee: 0,
      nhtEmployer: 0,

      educationTaxEmployee: 0,
      educationTaxEmployer: 0,

      paye: 0,
      heartEmployer: 0,

      pensionEmployee: 0,
      pensionEmployer: 0,

      totalEmployeeDeductions: 0,
      totalEmployerContributions: 0,

      netPayBeforeAdvance: 0,
      advanceRecovery: 0,
      netPay: 0,
      totalPayrollCost: 0,
    }
  );

  Object.keys(totals).forEach((key) => {
    totals[key] = roundMoney(totals[key]);
  });

  totals.nisPayable = roundMoney(
    totals.nisEmployee + totals.nisEmployer
  );

  totals.nhtPayable = roundMoney(
    totals.nhtEmployee + totals.nhtEmployer
  );

  totals.educationTaxPayable = roundMoney(
    totals.educationTaxEmployee +
      totals.educationTaxEmployer
  );

  totals.payePayable = roundMoney(totals.paye);

  totals.heartPayable = roundMoney(totals.heartEmployer);

  totals.pensionPayable = roundMoney(
    totals.pensionEmployee + totals.pensionEmployer
  );

  totals.totalGovernmentLiability = roundMoney(
    totals.nisPayable +
      totals.nhtPayable +
      totals.educationTaxPayable +
      totals.payePayable +
      totals.heartPayable +
      totals.pensionPayable
  );

  return totals;
};

const buildLiabilityBreakdown = ({
  taxType,
  employeePortion,
  employerPortion,
}) => {
  const breakdown = {
    paye: 0,

    nisEmployee: 0,
    nisEmployer: 0,

    nhtEmployee: 0,
    nhtEmployer: 0,

    educationTaxEmployee: 0,
    educationTaxEmployer: 0,

    heartEmployer: 0,

    pensionEmployee: 0,
    pensionEmployer: 0,

    gctOutputTax: 0,
    gctInputTaxCredit: 0,

    individualIncomeTax: 0,
    companyIncomeTax: 0,

    otherAmount: 0,
  };

  if (taxType === "NIS") {
    breakdown.nisEmployee = employeePortion;
    breakdown.nisEmployer = employerPortion;
  }

  if (taxType === "NHT") {
    breakdown.nhtEmployee = employeePortion;
    breakdown.nhtEmployer = employerPortion;
  }

  if (taxType === "Education Tax") {
    breakdown.educationTaxEmployee = employeePortion;
    breakdown.educationTaxEmployer = employerPortion;
  }

  if (taxType === "PAYE") {
    breakdown.paye = employeePortion;
  }

  if (taxType === "HEART") {
    breakdown.heartEmployer = employerPortion;
  }

  if (taxType === "Pension") {
    breakdown.pensionEmployee = employeePortion;
    breakdown.pensionEmployer = employerPortion;
  }

  return breakdown;
};

const getTaxRecords = T.handler(async (req, res) => {
  const scope = await S.fromQuery(req);

  const query = {
    entityCode: scope.entityCode,
    periodKey: scope.periodKey,
  };

  for (const field of [
    "taxCategory",
    "status",
    "sourceType",
  ]) {
    if (req.query[field]) {
      query[field] = T.text(
        req.query[field],
        field
      );
    }
  }

  if (req.query.taxType) {
    const taxType = T.canonical(
      T.text(req.query.taxType, "Tax type")
    );

    query.taxType = {
      $in: T.variants(taxType),
    };
  }

  const records = await TaxRecord.find(query)
    .sort({
      periodStart: -1,
      taxType: 1,
      taxNumber: 1,
    })
    .lean();

  const includedStatuses = new Set([
    "Reviewed",
    "Approved",
    "Submitted",
    "Partially Paid",
    "Paid",
    "Reconciled",
    "Overdue",
  ]);

  const includedRecords = records.filter(
    (record) =>
      includedStatuses.has(record.status)
  );

  const totalFor = (field) =>
    T.round(
      includedRecords.reduce(
        (total, record) =>
          total +
          T.amount(
            record[field] ?? 0,
            `${record.taxNumber}: ${field}`
          ),
        0
      )
    );

  return res.json({
    success: true,
    message: "Tax records retrieved successfully.",
    filters: {
      entityCode: scope.entityCode,
      periodKey: scope.periodKey,
    },
    data: records,
    summary: {
      totalTaxDue: totalFor("taxDue"),
      totalPaid: totalFor("amountPaid"),
      totalBalance: totalFor("balanceDue"),
      recordCount: records.length,

      openCount: includedRecords.filter(
        (record) =>
          T.amount(
            record.balanceDue ?? 0,
            "Balance due"
          ) > 0
      ).length,

      basis:
        "Totals include reviewed and later obligations. Draft, calculated, and cancelled records are excluded.",
    },
  });
});

const createTaxRecord = T.handler(
  async (req, res) => {
    const body = req.body || {};

    const entityCode = T.text(
      body.entityCode,
      "Business entity"
    ).toUpperCase();

    const periodStart = T.date(
      body.periodStart,
      "Period start"
    );

    const periodEnd = T.date(
      body.periodEnd,
      "Period end"
    );

    if (periodEnd < periodStart) {
      T.fail(
        "Period end cannot be earlier than period start."
      );
    }

    const taxType = T.canonical(
      T.text(body.taxType, "Tax type")
    );

    if (!T.map[taxType] && taxType !== "Other") {
      T.fail("Unsupported tax type.");
    }

    const taxableAmount = T.amount(
      body.taxableAmount ?? 0,
      "Taxable amount"
    );

    const taxRate = T.amount(
      body.taxRate ?? 0,
      "Tax rate"
    );

    if (taxRate > 100) {
      T.fail(
        "Tax rate cannot exceed 100 percent."
      );
    }

    const taxDue =
      body.taxDue === undefined
        ? T.round(
            (taxableAmount * taxRate) / 100
          )
        : T.amount(body.taxDue, "Tax due");

    const filingFrequency = T.text(
      body.filingFrequency || "Monthly",
      "Filing frequency"
    );

    if (
      ![
        "Monthly",
        "Quarterly",
        "Annual",
        "One-Time",
        "Other",
      ].includes(filingFrequency)
    ) {
      T.fail("Invalid filing frequency.");
    }

    if (
      filingFrequency === "Monthly" &&
      periodStart.slice(0, 7) !==
        periodEnd.slice(0, 7)
    ) {
      T.fail(
        "A monthly obligation must fall within one calendar month."
      );
    }

    if (
      filingFrequency === "Annual" &&
      periodStart.slice(0, 4) !==
        periodEnd.slice(0, 4)
    ) {
      T.fail(
        "This annual obligation must fall within one calendar year."
      );
    }

    const periodKey =
      filingFrequency === "Annual"
        ? periodStart.slice(0, 4)
        : periodStart.slice(0, 7);

    if (
      body.periodKey !== undefined &&
      T.text(body.periodKey, "Period key") !==
        periodKey
    ) {
      T.fail(
        "The selected period does not match the obligation dates."
      );
    }

    const dueDate = body.dueDate
      ? T.date(body.dueDate, "Due date")
      : "";

    const notes = T.text(
      body.notes ?? "",
      "Notes",
      false
    );

    const data = await transact(
      async (session) => {
        const entity = await S.resolve(
          entityCode,
          periodStart,
          periodEnd,
          session,
          true
        );

        if (
          taxType === "Company Tax" &&
          entity.taxTreatment?.incomeTaxType !==
            "Company Income Tax"
        ) {
          T.fail(
            "Company Tax does not match this business entity's configured income-tax treatment.",
            409
          );
        }

        if (
          taxType === "Income Tax" &&
          entity.taxTreatment?.incomeTaxType !==
            "Individual Income Tax"
        ) {
          T.fail(
            "Income Tax does not match this business entity's configured income-tax treatment.",
            409
          );
        }

        let taxCategory = "Payroll Statutory";

        if (taxType === "GCT") {
          taxCategory = "Consumption Tax";
        } else if (
          ["Income Tax", "Company Tax"].includes(
            taxType
          )
        ) {
          taxCategory = "Income Tax";
        } else if (taxType === "Pension") {
          taxCategory = "Pension";
        } else if (taxType === "Other") {
          taxCategory = "Other";
        }

        const userName = T.actor(req);

        const [record] = await TaxRecord.create(
          [
            {
              taxNumber: T.number("TAX"),

              entityId: entity._id,
              entityCode: entity.entityCode,
              entitySnapshot: S.snapshot(entity),

              businessType: entity.entityType,
              businessName: entity.legalName,
              businessTrn: entity.trn || "",

              taxType,
              taxCategory,

              periodKey,
              periodStart,
              periodEnd,
              filingFrequency,

              sourceType: "Manual",
              sourceModule: "Tax Center",

              taxableAmount,
              taxRate,
              taxDue,

              amountPaid: 0,
              balanceDue: taxDue,

              dueDate,
              notes,

              status: "Calculated",

              createdBy: userName,
              updatedBy: userName,
            },
          ],
          { session }
        );

        await writeAuditLog({
          req,
          session,
          action: "CREATE_TAX_OBLIGATION",
          module: "Tax Center",
          description:
            `Created ${record.taxNumber} for ` +
            entity.entityCode,
          targetType: "TaxRecord",
          targetId: record.taxNumber,
          afterValues: record.toObject(),
        });

        return record;
      }
    );

    return res.status(201).json({
      success: true,
      message:
        "Tax obligation created for review. No accounting liability was posted.",
      data,
    });
  }
);

const getScopedTaxPayrollData = async (
  scope,
  session = null
) => {
  const payrollRows = await Payroll.find({
    payPeriod: scope.periodKey,
    status: {
      $in: ["Approved", "Paid"],
    },
  })
    .session(session)
    .lean();

  const matchedPayroll = [];
  const unattributedPayrollNumbers = [];

  for (const payroll of payrollRows) {
    const entityCodes = [
      payroll.entityCode,
      payroll.entitySnapshot?.entityCode,
      payroll.businessEntitySnapshot?.entityCode,
    ]
      .filter(
        (value) =>
          value !== undefined &&
          value !== null &&
          String(value).trim() !== ""
      )
      .map((value) =>
        T.text(
          value,
          "Payroll business entity"
        ).toUpperCase()
      );

    const distinctCodes = [
      ...new Set(entityCodes),
    ];

    if (distinctCodes.length !== 1) {
      unattributedPayrollNumbers.push(
        payroll.payrollNumber ||
          String(payroll._id)
      );

      continue;
    }

    if (
      distinctCodes[0] === scope.entityCode
    ) {
      matchedPayroll.push(payroll);
    }
  }

  const sourceFields = {
    grossPay: "grossPay",
    nisEmployee: "nisEmployee",
    nisEmployer: "nisEmployer",
    nhtEmployee: "nhtEmployee",
    nhtEmployer: "nhtEmployer",
    educationTaxEmployee: "educationTax",
    educationTaxEmployer:
      "educationTaxEmployer",
    paye: "incomeTax",
    heartEmployer: "heartEmployer",
    pensionEmployee: "pensionEmployee",
    netPay: "netPay",
  };

  const totals = {};

  for (const [outputField, sourceField] of
    Object.entries(sourceFields)) {
    totals[outputField] = T.round(
      matchedPayroll.reduce(
        (total, payroll) =>
          total +
          T.amount(
            payroll[sourceField] ?? 0,
            `${payroll.payrollNumber || "Payroll"}: ${sourceField}`
          ),
        0
      )
    );
  }

  totals.totalEmployeeDeductions = T.round(
    totals.nisEmployee +
      totals.nhtEmployee +
      totals.educationTaxEmployee +
      totals.paye +
      totals.pensionEmployee
  );

  totals.totalGovernmentLiability = T.round(
    totals.nisEmployee +
      totals.nisEmployer +
      totals.nhtEmployee +
      totals.nhtEmployer +
      totals.educationTaxEmployee +
      totals.educationTaxEmployer +
      totals.paye +
      totals.heartEmployer
  );

  return {
    matchedPayroll,
    unattributedPayrollNumbers,
    totals,
  };
};

const generatePayrollTaxSummary = T.handler(
  async (req, res) => {
    const scope = await S.fromQuery(req);

    const payrollData =
      await getScopedTaxPayrollData(scope);

    const scopeVerified =
      payrollData.unattributedPayrollNumbers
        .length === 0;

    return res.json({
      success: true,
      message:
        "Business-period payroll tax summary generated successfully.",

      filters: {
        entityCode: scope.entityCode,
        periodKey: scope.periodKey,
      },

      data: {
        ...payrollData.totals,

        payrollRecordCount:
          payrollData.matchedPayroll.length,

        unattributedPayrollNumbers:
          payrollData.unattributedPayrollNumbers,

        scopeVerified,

        notice: scopeVerified
          ? "Totals include Approved and Paid payroll attributed to the selected business. This is a payroll summary, not a General Ledger or bank reconciliation."
          : "Payroll with missing or conflicting employer attribution has been excluded. Displayed totals cover attributed records only and may be incomplete.",
      },
    });
  }
);

const generatePayrollLiabilities = T.handler(
  async (req, res) => {
    const body = req.body || {};

    const scope = {
      entityCode: T.text(
        body.entityCode,
        "Business entity"
      ).toUpperCase(),

      periodKey: T.period(
        body.payPeriod || body.periodKey
      ),
    };

    const periodStart =
      `${scope.periodKey}-01`;

    const [year, month] = scope.periodKey
      .split("-")
      .map(Number);

    const periodEnd = new Date(
      Date.UTC(year, month, 0, 12)
    )
      .toISOString()
      .slice(0, 10);

    const data = await transact(
      async (session, Operation) => {
        const entity = await S.resolve(
          scope.entityCode,
          periodStart,
          periodEnd,
          session,
          true
        );

        const payrollData =
          await getScopedTaxPayrollData(
            scope,
            session
          );

        if (
          payrollData
            .unattributedPayrollNumbers.length
        ) {
          T.fail(
            "Payroll in this period has missing or conflicting employer attribution. Review those records before generating obligations.",
            409
          );
        }

        const payrollRows =
          payrollData.matchedPayroll;

        if (!payrollRows.length) {
          T.fail(
            "No Approved or Paid payroll is attributed to this business and period.",
            409
          );
        }

        if (
          payrollRows.some(
            (payroll) =>
              payroll.status !== "Paid" ||
              !payroll.journalEntryNumber
          )
        ) {
          T.fail(
            "Complete payroll payment and accounting posting before generating its tax obligations.",
            409
          );
        }

        const operationKey =
          `payroll:${scope.entityCode}:` +
          scope.periodKey;

        const previousOperation =
          await Operation.findById(
            operationKey
          ).session(session);

        const existingObligation =
          await TaxRecord.findOne({
            periodKey: scope.periodKey,
            sourceType: "Payroll",
            status: {
              $ne: "Cancelled",
            },
            $or: [
              {
                entityCode:
                  scope.entityCode,
              },
              { entityCode: "" },
              { entityCode: null },
            ],
          }).session(session);

        if (
          previousOperation ||
          existingObligation
        ) {
          T.fail(
            "Payroll obligations already exist, or historical obligations require entity review. No duplicate was created.",
            409
          );
        }

        const checkedJournalNumbers =
          new Set();

        for (const payroll of payrollRows) {
          const entryNumber =
            payroll.journalEntryNumber;

          if (
            checkedJournalNumbers.has(
              entryNumber
            )
          ) {
            continue;
          }

          const journal =
            await JournalEntry.findOne({
              entryNumber,
              entityCode:
                scope.entityCode,
              reportingPeriodKey:
                scope.periodKey,
              status: "Posted",
            }).session(session);

          if (
            !journal ||
            journal.reversalEntryNumber
          ) {
            T.fail(
              `Payroll journal ${entryNumber} must be posted, unreversed, and attributed to the selected business and period.`,
              409
            );
          }

          checkedJournalNumbers.add(
            entryNumber
          );
        }

        const totals = payrollData.totals;

        const liabilityItems = [
          ["PAYE", totals.paye, 0],

          [
            "NIS",
            totals.nisEmployee,
            totals.nisEmployer,
          ],

          [
            "NHT",
            totals.nhtEmployee,
            totals.nhtEmployer,
          ],

          [
            "Education Tax",
            totals.educationTaxEmployee,
            totals.educationTaxEmployer,
          ],

          [
            "HEART",
            0,
            totals.heartEmployer,
          ],

          [
            "Pension",
            totals.pensionEmployee,
            0,
          ],
        ];

        const payrollNumbers =
          payrollRows.map(
            (payroll) =>
              payroll.payrollNumber
          );

        const userName = T.actor(req);

        const payload =
          liabilityItems.map(
            ([
              taxType,
              employeePortion,
              employerPortion,
            ]) => {
              const taxDue = T.round(
                employeePortion +
                  employerPortion
              );

              return {
                taxNumber:
                  T.number("TAX-PAY"),

                entityId: entity._id,
                entityCode:
                  entity.entityCode,

                entitySnapshot:
                  S.snapshot(entity),

                businessType:
                  entity.entityType,

                businessName:
                  entity.legalName,

                businessTrn:
                  entity.trn || "",

                taxType,

                taxCategory:
                  taxType === "Pension"
                    ? "Pension"
                    : "Payroll Statutory",

                periodKey:
                  scope.periodKey,

                periodStart,
                periodEnd,
                filingFrequency:
                  "Monthly",

                sourceType: "Payroll",
                sourceModule: "Payroll",
                sourceReference:
                  operationKey,

                payrollNumbers,
                payrollRecordCount:
                  payrollRows.length,

                employeePortion,
                employerPortion,

                taxDue,
                amountPaid: 0,
                balanceDue: taxDue,

                status: "Calculated",

                calculationSnapshot: {
                  entityCode:
                    entity.entityCode,

                  periodKey:
                    scope.periodKey,

                  payrollNumbers,

                  journalEntryNumbers: [
                    ...checkedJournalNumbers,
                  ],

                  totals,
                },

                createdBy: userName,
                updatedBy: userName,
              };
            }
          );

        const records =
          await TaxRecord.create(
            payload,
            { session }
          );

        await Operation.create(
          [
            {
              _id: operationKey,

              result: {
                entityCode:
                  scope.entityCode,

                periodKey:
                  scope.periodKey,

                taxNumbers: records.map(
                  (record) =>
                    record.taxNumber
                ),
              },
            },
          ],
          { session }
        );

        await writeAuditLog({
          req,
          session,
          action:
            "GENERATE_PAYROLL_TAX_OBLIGATIONS",
          module: "Tax Center",

          description:
            `Generated payroll obligations for ` +
            `${scope.entityCode} ${scope.periodKey}`,

          metadata: {
            entityCode:
              scope.entityCode,

            periodKey:
              scope.periodKey,

            payrollNumbers,

            taxNumbers: records.map(
              (record) =>
                record.taxNumber
            ),
          },
        });

        return records;
      }
    );

    return res.status(201).json({
      success: true,

      message:
        "Payroll obligations generated from attributed posted payroll. No second liability journal was created.",

      totalRecords: data.length,
      data,
    });
  }
);

const transitionTaxRecordWorkflow = T.handler(
  async (req, res) => {
    const body = req.body || {};

    const action = T.text(
      body.action,
      "Workflow action"
    );

    const transitions = {
      Review: {
        from: "Calculated",
        to: "Reviewed",
      },

      Approve: {
        from: "Reviewed",
        to: "Approved",
      },

      Submit: {
        from: "Approved",
        to: "Submitted",
      },

      Reconcile: {
        from: "Paid",
        to: "Reconciled",
      },
    };

    const transition =
      transitions[action];

    if (!transition) {
      T.fail(
        "Action must be Review, Approve, Submit, or Reconcile."
      );
    }

    if (
      !Array.isArray(body.taxNumbers) ||
      body.taxNumbers.length === 0 ||
      body.taxNumbers.length > 50
    ) {
      T.fail(
        "Select between 1 and 50 tax records."
      );
    }

    const taxNumbers =
      body.taxNumbers.map(
        (value) =>
          T.text(value, "Tax number")
      );

    if (
      new Set(taxNumbers).size !==
      taxNumbers.length
    ) {
      T.fail(
        "The selected tax records contain duplicates."
      );
    }

    const notes = T.text(
      body.notes ?? "",
      "Workflow notes",
      false
    );

    let filingReference = "";
    let filingMethod = "";
    let filedDate = "";

    if (action === "Submit") {
      filingReference = T.text(
        body.filingReference,
        "Filing reference"
      );

      filingMethod = T.text(
        body.filingMethod,
        "Filing method"
      );

      if (
        ![
          "TAJ Online",
          "Manual Submission",
          "Tax Agent",
          "Other",
        ].includes(filingMethod)
      ) {
        T.fail(
          "Choose TAJ Online, Manual Submission, Tax Agent, or Other as the filing method."
        );
      }

      filedDate = T.date(
        body.filedDate,
        "Filed date"
      );

      if (filedDate > T.today()) {
        T.fail(
          "Filed date cannot be in the future."
        );
      }
    }

    const data = await transact(
      async (session) => {
        const records =
          await TaxRecord.find({
            taxNumber: {
              $in: taxNumbers,
            },
          })
            .sort({ taxNumber: 1 })
            .session(session);

        if (
          records.length !==
          taxNumbers.length
        ) {
          T.fail(
            "One or more selected tax records were not found.",
            404
          );
        }

        const entityCodes =
          new Set(
            records.map(
              (record) =>
                record.entityCode
            )
          );

        const periodKeys =
          new Set(
            records.map(
              (record) =>
                record.periodKey
            )
          );

        if (
          entityCodes.size !== 1 ||
          !records[0].entityCode
        ) {
          T.fail(
            "Select attributed tax records belonging to one business.",
            409
          );
        }

        if (
          periodKeys.size !== 1 ||
          !records[0].periodKey
        ) {
          T.fail(
            "Select tax records belonging to one reporting period.",
            409
          );
        }

        const userName = T.actor(req);

        for (const record of records) {
          const previousStatus =
            record.status;

          const zeroBalanceSubmitted =
            action === "Reconcile" &&
            previousStatus ===
              "Submitted" &&
            T.amount(
              record.balanceDue,
              "Balance due"
            ) === 0;

          if (
            previousStatus !==
              transition.from &&
            !zeroBalanceSubmitted
          ) {
            T.fail(
              `${record.taxNumber} is not eligible for ${action} while its status is ${previousStatus}.`,
              409
            );
          }

          await S.resolve(
            record.entityCode,
            record.periodStart,
            record.periodEnd,
            session
          );

          const taxDue = T.amount(
            record.taxDue,
            "Tax due"
          );

          const amountPaid = T.amount(
            record.amountPaid,
            "Amount paid"
          );

          const balanceDue = T.amount(
            record.balanceDue,
            "Balance due"
          );

          if (
            amountPaid > taxDue ||
            T.round(
              taxDue - amountPaid
            ) !== balanceDue
          ) {
            T.fail(
              `${record.taxNumber} has inconsistent balances. Review it before continuing.`,
              409
            );
          }

          if (
            action === "Submit" &&
            [
              "GCT Return",
              "Income Tax Estimate",
            ].includes(
              record.sourceType
            )
          ) {
            T.fail(
              `${record.taxNumber} must be submitted through its source filing workflow.`,
              409
            );
          }

          const beforeValues =
            record.toObject();

          const performedAt =
            new Date();

          if (action === "Review") {
            record.reviewedBy =
              userName;

            record.reviewedAt =
              performedAt;
          }

          if (action === "Approve") {
            record.approvedBy =
              userName;

            record.approvedAt =
              performedAt;
          }

          if (action === "Submit") {
            record.filingReference =
              filingReference;

            record.filingMethod =
              filingMethod;

            record.filedDate =
              filedDate;

            record.submittedBy =
              userName;

            record.submittedAt =
              performedAt;
          }

          if (
            action === "Reconcile"
          ) {
            if (
              balanceDue !== 0 ||
              !record.filingReference ||
              !record.submittedAt
            ) {
              T.fail(
                `${record.taxNumber} requires a zero balance and recorded filing evidence before reconciliation.`,
                409
              );
            }

            await assertEntityPeriodTaxTypeReconciled({
              entityCode:
                record.entityCode,

              periodKey:
                record.periodKey,

              taxType:
                record.taxType,

              session,
            });

            record.reconciledBy =
              userName;

            record.reconciledAt =
              performedAt;
          }

          record.status =
            transition.to;

          record.updatedBy =
            userName;

          record.workflowHistory.push({
            fromStatus:
              previousStatus,

            toStatus:
              record.status,

            action,
            notes,

            performedBy:
              userName,

            performedAt,
          });

          await record.save({
            session,
          });

          await writeAuditLog({
            req,
            session,

            action:
              `TAX_${action.toUpperCase()}`,

            module: "Tax Center",

            description:
              `${action}: ${record.taxNumber}`,

            targetType: "TaxRecord",
            targetId:
              record.taxNumber,

            beforeValues,

            afterValues:
              record.toObject(),
          });
        }

        return records;
      }
    );

    return res.json({
      success: true,

      message:
        `${action} completed for ` +
        `${data.length} selected tax record(s).`,

      totalRecords: data.length,
      data,
    });
  }
);

const payTaxRecord = T.handler(
  async (req, res) => {
    const body = req.body || {};

    const taxNumber = T.text(
      req.params.taxNumber,
      "Tax number"
    );

    const paymentAmount = T.amount(
      body.amount,
      "Payment amount",
      true
    );

    const paymentReference = T.text(
      body.paymentReference,
      "Payment reference"
    );

    const paymentAccountNumber = T.text(
      body.paymentAccountNumber,
      "Payment account"
    );

    const paymentDate = T.date(
      body.paymentDate || T.today(),
      "Payment date"
    );

    const paymentMethod = T.text(
      body.paymentMethod ?? "",
      "Payment method",
      false
    );

    const notes = T.text(
      body.notes ?? "",
      "Payment notes",
      false
    );

    const receiptUrl = T.text(
      body.receiptUrl ?? "",
      "Receipt reference",
      false
    );

    if (paymentDate > T.today()) {
      T.fail(
        "Future tax payments cannot be recorded."
      );
    }

    const requestHash = hash({
      taxNumber,
      paymentAmount,
      paymentReference,
      paymentAccountNumber,
      paymentDate,
      paymentMethod,
      notes,
      receiptUrl,
    });

    const operationKey =
      `payment:${hash(paymentReference)}`;

    const result = await transact(
      async (
        session,
        TaxControlledOperation
      ) => {
        const previousOperation =
          await TaxControlledOperation.findById(
            operationKey
          ).session(session);

        if (previousOperation) {
          if (
            previousOperation.hash !==
            requestHash
          ) {
            T.fail(
              "This payment reference has already been used with different payment details.",
              409
            );
          }

          return {
            ...previousOperation.result,
            replayed: true,
          };
        }

        const existingReference =
          await TaxRecord.findOne({
            "remittances.paymentReference":
              paymentReference,
          }).session(session);

        if (existingReference) {
          T.fail(
            "This payment reference already exists. Review its recorded remittance before retrying.",
            409
          );
        }

        const record =
          await TaxRecord.findOne({
            taxNumber,
          }).session(session);

        if (!record) {
          T.fail(
            "Tax record not found.",
            404
          );
        }

        const payableStatuses = [
          "Submitted",
          "Partially Paid",
          "Overdue",
        ];

        if (
          !payableStatuses.includes(
            record.status
          ) ||
          !record.filingReference ||
          !record.submittedAt
        ) {
          T.fail(
            "Only a submitted obligation with filing evidence can be paid.",
            409
          );
        }

        if (!record.entityCode) {
          T.fail(
            "This historical tax record requires reviewed business-entity attribution before payment.",
            409
          );
        }

        await S.resolve(
          record.entityCode,
          record.periodStart,
          record.periodEnd,
          session
        );

        const taxDue = T.amount(
          record.taxDue,
          "Recorded tax due"
        );

        const previouslyPaid = T.amount(
          record.amountPaid,
          "Recorded payments"
        );

        const outstandingBalance = T.round(
          taxDue - previouslyPaid
        );

        if (
          outstandingBalance <= 0 ||
          outstandingBalance !==
            T.amount(
              record.balanceDue,
              "Recorded balance"
            ) ||
          paymentAmount >
            outstandingBalance
        ) {
          T.fail(
            "The payment exceeds the verified outstanding balance, or the tax record balances are inconsistent.",
            409
          );
        }

        await assertEntityPeriodTaxTypeReconciled({
          entityCode: record.entityCode,
          periodKey: record.periodKey,
          taxType: record.taxType,
          session,
        });

        const paymentAccount =
          await FinancialAccount.findOne({
            accountNumber:
              paymentAccountNumber,
            status: "Active",
          }).session(session);

        if (
          !paymentAccount ||
          !["Cash", "Bank"].includes(
            paymentAccount.accountType
          ) ||
          paymentAccount.currency !==
            "JMD" ||
          paymentAccount.baseCurrency !==
            "JMD"
        ) {
          T.fail(
            "Choose an Active JMD Cash or Bank account. Foreign-currency and credit-card tax funding require a separately reviewed workflow.",
            409
          );
        }

        const linkedAccountCode = T.text(
          paymentAccount.linkedChartAccountCode,
          "Linked chart account"
        );

        const linkedFinancialAccounts =
          await FinancialAccount.find({
            linkedChartAccountCode:
              linkedAccountCode,
          }).session(session);

        const paymentChartAccount =
          await ChartOfAccount.findOne({
            accountCode:
              linkedAccountCode,
            status: "Active",
            accountCategory: "Asset",
            normalBalance: "Debit",
          }).session(session);

        if (
          !paymentChartAccount ||
          linkedFinancialAccounts.length !==
            1 ||
          linkedFinancialAccounts[0]
            .accountNumber !==
            paymentAccountNumber
        ) {
          T.fail(
            "The payment account must have a unique link to an Active debit-balance Asset account.",
            409
          );
        }

        const financialBalance = Number(
          paymentAccount.currentBalance
        );

        const chartBalance = Number(
          paymentChartAccount.currentBalance
        );

        if (
          !Number.isFinite(
            financialBalance
          ) ||
          !Number.isFinite(
            chartBalance
          ) ||
          T.round(financialBalance) !==
            T.round(chartBalance) ||
          financialBalance <
            paymentAmount
        ) {
          T.fail(
            "The payment-account balances disagree or recorded funds are insufficient. Review Banking before recording this payment.",
            409
          );
        }

        const payableAccountCode =
          T.map[
            T.canonical(
              record.taxType
            )
          ];

        if (!payableAccountCode) {
          T.fail(
            "No supported tax payable mapping exists for this obligation.",
            409
          );
        }

        if (
          linkedAccountCode ===
          payableAccountCode
        ) {
          T.fail(
            "The payment account cannot be the tax payable account.",
            409
          );
        }

        const payableChartAccount =
          await ChartOfAccount.findOne({
            accountCode:
              payableAccountCode,
            status: "Active",
            accountCategory:
              "Liability",
            normalBalance: "Credit",
          }).session(session);

        if (!payableChartAccount) {
          T.fail(
            "The tax payable mapping requires an Active credit-balance Liability account.",
            409
          );
        }

        const incorrectlyLinkedAccounts =
          await FinancialAccount.find({
            linkedChartAccountCode:
              payableAccountCode,
          }).session(session);

        if (
          incorrectlyLinkedAccounts.length >
          0
        ) {
          T.fail(
            "The tax payable account must not also be linked as a financial payment account.",
            409
          );
        }

        const beforeValues =
          record.toObject();

        const journalEntry =
          await postTaxLiabilityPayment({
            taxRecord: record,
            paymentAccount,
            amount: paymentAmount,
            paymentDate,
            paymentReference,
            user: req.user,
            session,
          });

        const transactionNumber =
          T.number("TRN");

        const remittanceNumber =
          T.number("TAXPAY");

        await AccountTransaction.create(
          [
            {
              transactionNumber,

              accountNumber:
                paymentAccount.accountNumber,

              accountName:
                paymentAccount.accountName,

              linkedChartAccountCode:
                linkedAccountCode,

              journalEntryNumber:
                journalEntry.entryNumber,

              ledgerReference:
                journalEntry.entryNumber,

              transactionType:
                "Tax Payment",

              transactionDirection:
                "Withdrawal",

              amount: paymentAmount,
              paymentMethod,
              reference:
                paymentReference,

              transactionDate:
                new Date(
                  `${paymentDate}T12:00:00.000Z`
                ),

              taxNumber:
                record.taxNumber,

              taxType:
                record.taxType,

              taxPeriodKey:
                record.periodKey,

              notes,
            },
          ],
          {
            session,
          }
        );

        record.amountPaid = T.round(
          previouslyPaid +
            paymentAmount
        );

        record.balanceDue = T.round(
          outstandingBalance -
            paymentAmount
        );

        record.status =
          record.balanceDue === 0
            ? "Paid"
            : "Partially Paid";

        record.updatedBy =
          T.actor(req);

        record.remittances.push({
          remittanceNumber,
          paymentDate,
          amount: paymentAmount,
          paymentMethod,
          paymentReference,

          paymentAccountNumber:
            paymentAccount.accountNumber,

          paymentAccountName:
            paymentAccount.accountName,

          journalEntryNumber:
            journalEntry.entryNumber,

          receiptUrl,
          notes,

          recordedBy:
            T.actor(req),

          recordedAt:
            new Date(),
        });

        record.workflowHistory.push({
          fromStatus:
            beforeValues.status,

          toStatus:
            record.status,

          action: "Payment",

          notes:
            `${remittanceNumber}: ` +
            `${paymentReference}`,

          performedBy:
            T.actor(req),

          performedAt:
            new Date(),
        });

        await record.save({
          session,
        });

        const linkedEstimate =
          await IncomeTaxEstimate.findOne({
            taxRecordId:
              record._id,
          }).session(session);

        if (linkedEstimate) {
          if (
            linkedEstimate.entityCode !==
              record.entityCode ||
            T.amount(
              linkedEstimate.estimatedTaxDue
            ) !== taxDue
          ) {
            T.fail(
              "The linked estimate and tax obligation have different entities or amounts.",
              409
            );
          }

          linkedEstimate.amountPaid =
            record.amountPaid;

          linkedEstimate.balanceDue =
            record.balanceDue;

          linkedEstimate.status =
            record.status;

          await linkedEstimate.save({
            session,
          });
        }

        const linkedGctFiling =
          await GctFilingPeriod.findOne({
            taxRecordId:
              record._id,
          }).session(session);

        if (
          linkedGctFiling &&
          record.status === "Paid"
        ) {
          linkedGctFiling.status =
            "Paid";

          await linkedGctFiling.save({
            session,
          });
        }

        await writeAuditLog({
          req,
          session,

          action:
            "PAY_TAX_OBLIGATION",

          module:
            "Tax Center",

          description:
            `Paid ${record.taxNumber}`,

          targetType:
            "TaxRecord",

          targetId:
            record.taxNumber,

          beforeValues,

          afterValues:
            record.toObject(),

          journalEntryNumber:
            journalEntry.entryNumber,
        });

        const paymentResult = {
          taxNumber:
            record.taxNumber,

          remittanceNumber,
          transactionNumber,

          journalEntryNumber:
            journalEntry.entryNumber,

          balanceDue:
            record.balanceDue,
        };

        await TaxControlledOperation.create(
          [
            {
              _id:
                operationKey,

              hash:
                requestHash,

              result:
                paymentResult,
            },
          ],
          {
            session,
          }
        );

        return paymentResult;
      }
    );

    return res
      .status(
        result.replayed ? 200 : 201
      )
      .json({
        success: true,

        paymentRequestReplayed:
          Boolean(result.replayed),

        message:
          result.replayed
            ? "Previously recorded payment returned. No duplicate payment was posted."
            : "Tax payment and accounting records saved successfully.",

        data: result,
      });
  }
);

const getTaxDeadlineRules = async (req, res) => {
  try {
    const {
      taxType = "",
      businessType = "",
      status = "",
    } = req.query;

    const query = {};

    if (taxType) query.taxType = taxType;
    if (businessType) query.businessType = businessType;
    if (status) query.status = status;

    const rules = await TaxDeadlineRule.find(query).sort({
      taxType: 1,
      businessType: 1,
      effectiveFrom: -1,
    });

    res.json({
      success: true,
      message:
        "Tax deadline rules retrieved successfully",
      totalRecords: rules.length,
      data: rules,
    });
  } catch (error) {
    console.error(
      "Get tax deadline rules error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not retrieve tax deadline rules",
      error: error.message,
    });
  }
};

const createTaxDeadlineRule = async (req, res) => {
  try {
    const {
      ruleCode,
      name,
      taxType,
      businessType = "All",
      filingFrequency,
      filingForm = "",
      effectiveFrom,
      effectiveTo = null,
      dueDateRule = {},
      reminderDays = [30, 14, 7, 3, 1],
      sourceName = "",
      sourceUrl = "",
      sourceReference = "",
      sourceVerifiedAt = null,
      notes = "",
    } = req.body;

    if (
      !ruleCode ||
      !name ||
      !taxType ||
      !filingFrequency ||
      !effectiveFrom
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Rule code, name, tax type, filing frequency and effective-from date are required.",
      });
    }

    const existingRule =
      await TaxDeadlineRule.findOne({
        ruleCode: String(ruleCode).trim(),
      });

    if (existingRule) {
      return res.status(409).json({
        success: false,
        message:
          `Deadline rule ${ruleCode} already exists.`,
      });
    }

    const performedBy = getUserName(req.user);

    const rule = await TaxDeadlineRule.create({
      ruleCode: String(ruleCode).trim(),
      name: String(name).trim(),
      countryCode: "JM",
      taxType,
      businessType,
      filingFrequency,
      filingForm: String(filingForm).trim(),
      effectiveFrom,
      effectiveTo,
      dueDateRule,
      reminderDays,
      sourceName: String(sourceName).trim(),
      sourceUrl: String(sourceUrl).trim(),
      sourceReference:
        String(sourceReference).trim(),
      sourceVerifiedAt,
      notes: String(notes).trim(),
      status: "Draft",
      createdBy: performedBy,
      updatedBy: performedBy,
    });

    res.status(201).json({
      success: true,
      message:
        "Draft tax deadline rule created successfully",
      data: rule,
    });
  } catch (error) {
    console.error(
      "Create tax deadline rule error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not create tax deadline rule",
      error: error.message,
    });
  }
};

const activateTaxDeadlineRule = async (
  req,
  res
) => {
  try {
    const { ruleCode } = req.params;

    const rule = await TaxDeadlineRule.findOne({
      ruleCode,
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Tax deadline rule not found.",
      });
    }

    if (rule.status === "Active") {
      return res.status(409).json({
        success: false,
        message:
          `${rule.ruleCode} is already active.`,
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
          "A rule cannot be activated until its source name, source URL or reference, and verification date are recorded.",
      });
    }

    const overlappingRule =
      await TaxDeadlineRule.findOne({
        _id: {
          $ne: rule._id,
        },

        countryCode: rule.countryCode,
        taxType: rule.taxType,
        businessType: rule.businessType,
        filingFrequency: rule.filingFrequency,
        status: "Active",

        effectiveFrom: {
          $lte:
            rule.effectiveTo ||
            new Date("9999-12-31T23:59:59.999Z"),
        },

        $or: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              $gte: rule.effectiveFrom,
            },
          },
        ],
      });

    if (overlappingRule) {
      return res.status(409).json({
        success: false,
        message:
          `${rule.ruleCode} overlaps active rule ${overlappingRule.ruleCode}.`,
      });
    }

    rule.status = "Active";
    rule.updatedBy = getUserName(req.user);

    await rule.save();

    res.json({
      success: true,
      message:
        `${rule.ruleCode} activated successfully.`,
      data: rule,
    });
  } catch (error) {
    console.error(
      "Activate tax deadline rule error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not activate tax deadline rule",
      error: error.message,
    });
  }
};

const applyTaxDeadlines = T.handler(
  async (req, res) => {
    const body = req.body || {};

    const entityCode = T.text(
      body.entityCode,
      "Business entity"
    ).toUpperCase();

    const periodKey = T.text(
      body.periodKey,
      "Reporting period"
    );

    if (/^\d{4}$/.test(periodKey)) {
      T.date(
        `${periodKey}-01-01`,
        "Reporting year"
      );
    } else {
      T.period(periodKey);
    }

    const query = {
      entityCode,
      periodKey,

      status: {
        $nin: [
          "Paid",
          "Reconciled",
          "Cancelled",
        ],
      },
    };

    if (body.sourceType) {
      query.sourceType = T.text(
        body.sourceType,
        "Source type"
      );
    }

    const data = await transact(
      async (session) => {
        const records =
          await TaxRecord.find(query)
            .sort({
              taxType: 1,
              taxNumber: 1,
            })
            .session(session);

        if (!records.length) {
          T.fail(
            "No eligible obligations were found for this business and period.",
            404
          );
        }

        const userName =
          T.actor(req);

        for (const record of records) {
          const entity = await S.resolve(
            record.entityCode,
            record.periodStart,
            record.periodEnd,
            session
          );

          if (
            record.businessType !==
            entity.entityType
          ) {
            T.fail(
              `${record.taxNumber} has a business-type mismatch. Review its attribution before applying deadlines.`,
              409
            );
          }

          const beforeValues =
            record.toObject();

          await applyDeadlineRuleToRecord(
            record,
            session
          );

          record.updatedBy =
            userName;

          record.workflowHistory.push({
            fromStatus:
              record.status,

            toStatus:
              record.status,

            action:
              "Deadline Assessment",

            notes:
              `Due date confirmed as ${record.dueDate}. Workflow status preserved.`,

            performedBy:
              userName,

            performedAt:
              new Date(),
          });

          await record.save({
            session,
          });

          await writeAuditLog({
            req,
            session,

            action:
              "APPLY_TAX_DEADLINE",

            module: "Tax Center",

            description:
              `Applied deadline to ${record.taxNumber}`,

            targetType:
              "TaxRecord",

            targetId:
              record.taxNumber,

            beforeValues,

            afterValues:
              record.toObject(),
          });
        }

        return records;
      }
    );

    return res.json({
      success: true,

      message:
        "Tax deadlines applied successfully. Approval and submission statuses were preserved.",

      filters: {
        entityCode,
        periodKey,
      },

      summary: {
        requestedRecords:
          data.length,

        updatedRecords:
          data.length,

        failedRecords: 0,
      },

      data,
      errors: [],
    });
  }
);

const transitionGctFilingWorkflow = T.handler(
  async (req, res) => {
    const body = req.body || {};

    const filingNumber = T.text(
      req.params.filingNumber,
      "Filing number"
    );

    const action = T.text(
      body.action,
      "Workflow action"
    ).toLowerCase();

    const transitions = {
      review: ["Calculated", "Reviewed"],
      approve: ["Reviewed", "Approved"],
      submit: ["Approved", "Submitted"],
      reconcile: ["Paid", "Reconciled"],
    };

    if (!transitions[action]) {
      T.fail(
        "Action must be Review, Approve, Submit, or Reconcile."
      );
    }

    const notes = T.text(
      body.notes ?? "",
      "Workflow notes",
      false
    );

    const data = await transact(
      async (session) => {
        const filing =
          await GctFilingPeriod.findOne({
            filingNumber,
          }).session(session);

        if (!filing) {
          T.fail(
            "GCT filing not found.",
            404
          );
        }

        if (
          filing.status !==
          transitions[action][0]
        ) {
          T.fail(
            `This filing cannot ${action} while its status is ${filing.status}.`,
            409
          );
        }

        if (
          filing.calculationMode !==
            "Compliance" ||
          filing.registrationStatus !==
            "Registered" ||
          !filing.canFileReturn
        ) {
          T.fail(
            "A Preview filing cannot enter the compliance workflow.",
            409
          );
        }

        const entity = await S.resolve(
          filing.entityCode,
          filing.periodStart,
          filing.periodEnd,
          session
        );

        const rows =
          await GctRegisterEntry.find({
            filingNumber,
          })
            .session(session)
            .lean();

        const outputRows = rows.filter(
          (row) =>
            row.registerType ===
            "Output GCT"
        );

        const inputRows = rows.filter(
          (row) =>
            row.registerType ===
            "Input GCT"
        );

        if (
          outputRows.length !==
            filing.invoiceCount ||
          inputRows.length !==
            filing.expenseCount ||
          rows.length !==
            outputRows.length +
              inputRows.length
        ) {
          T.fail(
            "Register counts differ from the filing. Recalculate and review it.",
            409
          );
        }

        if (
          rows.some(
            (row) =>
              row.entityCode !==
                filing.entityCode ||
              row.periodKey !==
                filing.periodKey ||
              String(
                row.filingPeriodId
              ) !==
                String(filing._id) ||
              row.calculationMode !==
                "Compliance" ||
              row.registrationStatus !==
                "Registered"
          )
        ) {
          T.fail(
            "Register attribution or filing links are inconsistent.",
            409
          );
        }

        if (
          outputRows.some(
            (row) =>
              ![
                "Reviewed",
                "Adjusted",
              ].includes(
                row.classificationStatus
              ) ||
              row.classification ===
                "Pending Review"
          ) ||
          inputRows.some(
            (row) =>
              T.amount(
                row.pendingVerificationGctAmount ??
                  0
              ) > 0
          )
        ) {
          T.fail(
            "Complete invoice classifications and supplier-evidence review before continuing.",
            409
          );
        }

        const sum = (items, field) =>
          T.round(
            items.reduce(
              (total, item) =>
                total +
                T.amount(
                  item[field] ?? 0,
                  field
                ),
              0
            )
          );

        const output = T.amount(
          filing.outputGct,
          "Output GCT"
        );

        const input = T.amount(
          filing.inputGctCredit,
          "Input GCT credit"
        );

        if (
          sum(
            outputRows,
            "gctAmount"
          ) !== output ||
          sum(
            inputRows,
            "claimableGctAmount"
          ) !== input ||
          T.round(
            output - input
          ) !==
            Number(filing.netGct)
        ) {
          T.fail(
            "Filing totals differ from the register. Adjusted filings require a separately reviewed adjustment workflow.",
            409
          );
        }

        const stable = (value) => {
          if (Array.isArray(value)) {
            return value.map(stable);
          }

          if (
            value &&
            typeof value === "object" &&
            !(value instanceof Date)
          ) {
            return Object.fromEntries(
              Object.keys(value)
                .sort()
                .map(
                  (key) => [
                    key,
                    stable(value[key]),
                  ]
                )
            );
          }

          return value;
        };

        const equivalent = (
          first,
          second
        ) =>
          JSON.stringify(
            stable(
              JSON.parse(
                JSON.stringify(first)
              )
            )
          ) ===
          JSON.stringify(
            stable(
              JSON.parse(
                JSON.stringify(second)
              )
            )
          );

        for (const row of rows) {
          const isInvoice =
            row.registerType ===
            "Output GCT";

          const source =
            await (
              isInvoice
                ? Invoice
                : Expense
            )
              .findById(
                row.sourceDocumentId
              )
              .session(session)
              .lean();

          if (
            !source ||
            [
              "Draft",
              "Cancelled",
              "Refunded",
            ].includes(source.status)
          ) {
            T.fail(
              "A filing source is unavailable or no longer eligible.",
              409
            );
          }

          const snapshot =
            row.sourceSnapshot || {};

          const sourceDate = T.date(
            isInvoice
              ? source.createdAt
              : source.date,

            "Source date"
          );

          const savedDate =
            isInvoice
              ? snapshot.invoiceDate
              : snapshot.expenseDate;

          const codes = [
            source.entityCode,
            source.entitySnapshot
              ?.entityCode,
            source.businessEntitySnapshot
              ?.entityCode,
          ]
            .filter(Boolean)
            .map(
              (code) =>
                String(code)
                  .trim()
                  .toUpperCase()
            );

          if (
            new Set(codes).size !== 1 ||
            codes[0] !==
              filing.entityCode ||
            sourceDate !== savedDate ||
            sourceDate <
              filing.periodStart ||
            sourceDate >
              filing.periodEnd ||
            source.status !==
              snapshot.status
          ) {
            T.fail(
              "A source date, status, or business identity changed after calculation.",
              409
            );
          }

          const amountField =
            isInvoice
              ? "finalTotal"
              : "amount";

          if (
            T.amount(
              source[amountField]
            ) !==
            T.amount(
              snapshot[amountField]
            ) ||
            !equivalent(
              snapshot.gctTreatment ||
                {},
              source.gctTreatment ||
                {}
            ) ||
            (
              isInvoice &&
              !equivalent(
                snapshot
                  .turnoverClassification ||
                  {},
                source
                  .turnoverClassification ||
                  {}
              )
            )
          ) {
            T.fail(
              "A source amount or GCT review changed after calculation. Recalculation and review are required.",
              409
            );
          }
        }

        const beforeValues =
          filing.toObject();

        const userName =
          T.actor(req);

        const now = new Date();

        if (action === "review") {
          filing.reviewedBy =
            userName;

          filing.reviewedAt = now;
          filing.reviewNotes = notes;
        }

        if (action === "approve") {
          filing.approvedBy =
            userName;

          filing.approvedAt = now;
          filing.approvalNotes = notes;
        }

        if (action === "submit") {
          if (
            filing.taxRecordId ||
            filing.taxNumber ||
            filing
              .settlementJournalEntryNumber
          ) {
            T.fail(
              "This filing already has accounting links requiring review.",
              409
            );
          }

          const existing =
            await TaxRecord.findOne({
              sourceType:
                "GCT Return",

              sourceReference:
                filingNumber,
            }).session(session);

          const existingSettlement =
            await JournalEntry.findOne({
              reference:
                filingNumber,

              sourceModule:
                "Tax Center",
            }).session(session);

          if (
            existing ||
            existingSettlement
          ) {
            T.fail(
              "Existing filing accounting requires review. No duplicate was posted.",
              409
            );
          }

          const filingReference =
            T.text(
              body.filingReference,
              "Official filing reference"
            );

          const filingMethod =
            T.text(
              body.filingMethod,
              "Filing method"
            );

          if (
            ![
              "TAJ Online",
              "Manual Submission",
              "Tax Agent",
              "Other",
            ].includes(filingMethod)
          ) {
            T.fail(
              "Invalid GCT filing method."
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

          for (const [
            accountCode,
            requiredAmount,
            sign,
          ] of [
            ["2160", output, 1],
            ["1170", input, -1],
          ]) {
            const ledgerRows =
              await GeneralLedgerTransaction.find({
                entityCode:
                  filing.entityCode,

                reportingPeriodKey:
                  filing.periodKey,

                accountCode,
              })
                .session(session)
                .lean();

            const recordedAmount =
              T.round(
                ledgerRows.reduce(
                  (total, row) =>
                    total +
                    sign *
                      (
                        T.amount(
                          row.credit ?? 0
                        ) -
                        T.amount(
                          row.debit ?? 0
                        )
                      ),
                  0
                )
              );

            if (
              recordedAmount <
              requiredAmount
            ) {
              T.fail(
                `Ledger account ${accountCode} does not contain enough recorded source tax to support this settlement.`,
                409
              );
            }

            for (const row of ledgerRows) {
              const journal =
                await JournalEntry.findOne({
                  entryNumber:
                    row.entryNumber,

                  entityCode:
                    filing.entityCode,

                  reportingPeriodKey:
                    filing.periodKey,

                  status: {
                    $in: [
                      "Posted",
                      "Reversed",
                    ],
                  },
                }).session(session);

              if (
                !journal ||
                (
                  journal.status ===
                    "Reversed" &&
                  !journal
                    .reversalEntryNumber
                )
              ) {
                T.fail(
                  "A supporting tax journal is missing, unposted, or has incomplete reversal evidence.",
                  409
                );
              }
            }
          }

          const journal =
            await postGctFilingSettlement({
              filingPeriod: filing,
              postingDate:
                filedDate,
              user: req.user,
              session,
            });

          if (journal) {
            filing.settlementJournalEntryNumber =
              journal.entryNumber;

            filing.settlementPostedAt =
              now;

            filing.settlementPostedBy =
              userName;
          }

          const payable =
            Math.max(
              0,
              T.round(
                output - input
              )
            );

          if (payable > 0) {
            const [record] =
              await TaxRecord.create(
                [
                  {
                    taxNumber:
                      T.number("TAX-GCT"),

                    entityId:
                      entity._id,

                    entityCode:
                      entity.entityCode,

                    entitySnapshot:
                      S.snapshot(entity),

                    businessType:
                      entity.entityType,

                    businessName:
                      entity.legalName,

                    businessTrn:
                      entity.trn || "",

                    taxType: "GCT",

                    taxCategory:
                      "Consumption Tax",

                    periodKey:
                      filing.periodKey,

                    periodStart:
                      filing.periodStart,

                    periodEnd:
                      filing.periodEnd,

                    filingFrequency:
                      filing.filingFrequency,

                    sourceType:
                      "GCT Return",

                    sourceModule:
                      "Tax Center",

                    sourceReference:
                      filingNumber,

                    taxDue:
                      payable,

                    amountPaid: 0,
                    balanceDue:
                      payable,

                    status:
                      "Submitted",

                    filingReference,
                    filingMethod,
                    filedDate,

                    reviewedBy:
                      filing.reviewedBy,

                    reviewedAt:
                      filing.reviewedAt,

                    approvedBy:
                      filing.approvedBy,

                    approvedAt:
                      filing.approvedAt,

                    submittedBy:
                      userName,

                    submittedAt: now,

                    journalEntryNumber:
                      journal
                        ?.entryNumber ||
                      "",

                    createdBy:
                      userName,

                    updatedBy:
                      userName,
                  },
                ],
                { session }
              );

            filing.taxRecordId =
              record._id;

            filing.taxNumber =
              record.taxNumber;

            await writeAuditLog({
              req,
              session,

              action:
                "CREATE_GCT_OBLIGATION",

              module: "Tax Center",

              description:
                `Created ${record.taxNumber}`,

              targetType:
                "TaxRecord",

              targetId:
                record.taxNumber,

              afterValues:
                record.toObject(),
            });
          }

          filing.filingReference =
            filingReference;

          filing.filingMethod =
            filingMethod;

          filing.filedDate =
            filedDate;

          filing.submittedBy =
            userName;

          filing.submittedAt =
            now;
        }

        if (
          action === "reconcile"
        ) {
          const record =
            filing.taxRecordId
              ? await TaxRecord.findById(
                  filing.taxRecordId
                ).session(session)
              : null;

          if (
            !record ||
            record.status !==
              "Reconciled" ||
            record.entityCode !==
              filing.entityCode ||
            record.periodKey !==
              filing.periodKey ||
            record.taxNumber !==
              filing.taxNumber ||
            T.amount(
              record.taxDue
            ) !==
              Math.max(
                0,
                T.round(
                  output - input
                )
              ) ||
            T.amount(
              record.balanceDue
            ) !== 0
          ) {
            T.fail(
              "Reconcile the matching zero-balance tax obligation first.",
              409
            );
          }

          await assertEntityPeriodTaxTypeReconciled({
            entityCode:
              record.entityCode,

            periodKey:
              record.periodKey,

            taxType: "GCT",
            session,
          });

          filing.reconciledBy =
            userName;

          filing.reconciledAt =
            now;

          filing.reconciliationNotes =
            notes;
        }

        filing.status =
          transitions[action][1];

        filing.workflowHistory.push({
          fromStatus:
            beforeValues.status,

          toStatus:
            filing.status,

          action,
          notes,

          performedBy:
            userName,

          performedAt: now,
        });

        await filing.save({
          session,
        });

        await writeAuditLog({
          req,
          session,

          action:
            `GCT_${action.toUpperCase()}`,

          module: "Tax Center",

          description:
            `${action}: ${filingNumber}`,

          targetType:
            "GctFilingPeriod",

          targetId:
            filingNumber,

          beforeValues,

          afterValues:
            filing.toObject(),
        });

        return filing;
      }
    );

    return res.json({
      success: true,

      message:
        `GCT filing ${action} completed.`,

      data: {
        filingPeriod: data,
      },
    });
  }
);

const getGctFilingPeriods = T.handler(
  async (req, res) => {
    const entityCode = T.text(
      req.query.entityCode,
      "Business entity"
    ).toUpperCase();

    const periodKey = T.period(
      req.query.periodKey
    );

    const query = {
      entityCode,
      periodKey,
    };

    for (const field of [
      "status",
      "calculationMode",
    ]) {
      if (req.query[field]) {
        query[field] = T.text(
          req.query[field],
          field
        );
      }
    }

    const filingPeriods =
      await GctFilingPeriod.find(
        query
      )
        .sort({
          periodStart: -1,
          createdAt: -1,
        })
        .lean();

    return res.json({
      success: true,

      message:
        "GCT filing periods retrieved successfully.",

      filters: {
        entityCode,
        periodKey,
      },

      totalRecords:
        filingPeriods.length,

      data: filingPeriods,
    });
  }
);

const calculateGctFilingPeriod = T.handler(
  async (req, res) => {
    const body = req.body || {};

    const entityCode = T.text(
      body.entityCode,
      "Business entity"
    ).toUpperCase();

    const periodKey = T.period(
      body.periodKey
    );

    const result =
      await generateGctFilingPeriod({
        entityCode,
        periodKey,
        user: req.user,
      });

    return res.status(201).json({
      success: true,

      message:
        result.filingPeriod
          .calculationMode === "Preview"
          ? "Preview saved. No payable obligation or accounting settlement was posted."
          : "GCT calculation and register saved together for review. No payable obligation or accounting settlement was posted.",

      filters: {
        entityCode,
        periodKey,
      },

      data:
        result.filingPeriod,

      summary:
        result.summary,
    });
  }
);

const getGctFilingRegister = T.handler(
  async (req, res) => {
    const entityCode = T.text(
      req.query.entityCode,
      "Business entity"
    ).toUpperCase();

    const periodKey = T.period(
      req.params.periodKey
    );

    const registerType = T.text(
      req.query.registerType ?? "",
      "Register type",
      false
    );

    if (
      registerType &&
      ![
        "Output GCT",
        "Input GCT",
      ].includes(registerType)
    ) {
      T.fail(
        "Register type must be Output GCT or Input GCT."
      );
    }

    const filingPeriod =
      await GctFilingPeriod.findOne({
        entityCode,
        periodKey,
      }).lean();

    if (!filingPeriod) {
      T.fail(
        `No GCT filing exists for ${entityCode} and ${periodKey}.`,
        404
      );
    }

    const register =
      await getGctRegister({
        entityCode,
        periodKey,
        registerType,
      });

    if (
      register.some(
        (entry) =>
          entry.filingNumber !==
            filingPeriod.filingNumber ||
          String(
            entry.filingPeriodId
          ) !==
            String(filingPeriod._id)
      )
    ) {
      T.fail(
        "Register entries have inconsistent filing links and require review.",
        409
      );
    }

    const moneyFields = [
      "grossAmount",
      "taxableAmount",
      "gctAmount",
      "claimableGctAmount",
      "disallowedGctAmount",
      "pendingVerificationGctAmount",
    ];

    const summary = {
      recordCount:
        register.length,

      preliminaryEntries: 0,
      includedInReturn: 0,

      grossAmount: 0,
      taxableAmount: 0,
      gctAmount: 0,
      claimableGctAmount: 0,
      disallowedGctAmount: 0,
      pendingVerificationGctAmount: 0,
    };

    for (const entry of register) {
      for (const field of moneyFields) {
        summary[field] = T.round(
          summary[field] +
            T.amount(
              entry[field] ?? 0,
              field
            )
        );
      }

      if (
        entry.classificationStatus ===
        "Preliminary"
      ) {
        summary.preliminaryEntries += 1;
      }

      if (
        entry.eligibility
          ?.includedInReturn === true
      ) {
        summary.includedInReturn += 1;
      }
    }

    return res.json({
      success: true,

      message:
        "GCT register retrieved successfully.",

      filingPeriod: {
        filingNumber:
          filingPeriod.filingNumber,

        entityCode:
          filingPeriod.entityCode,

        periodKey:
          filingPeriod.periodKey,

        calculationMode:
          filingPeriod.calculationMode,

        registrationStatus:
          filingPeriod.registrationStatus,

        status:
          filingPeriod.status,

        canFileReturn:
          filingPeriod.canFileReturn,
      },

      filters: {
        entityCode,
        periodKey,

        registerType:
          registerType || "All",
      },

      summary,
      data: register,
    });
  }
);

const getGctRegistrationProfiles = async (req, res) => {
  try {
    const {
      entityCode = "",
      registrationStatus = "",
      status = "",
    } = req.query;

    const query = {
      taxType: "GCT",
    };

    if (entityCode) {
      query.entityCode = String(entityCode).trim();
    }

    if (registrationStatus) {
      query.registrationStatus =
        String(registrationStatus).trim();
    }

    if (status) {
      query.status = String(status).trim();
    }

    const profiles = await TaxRegistrationProfile.find(query).sort({
      effectiveFrom: -1,
      createdAt: -1,
    });

    res.json({
      success: true,
      message: "GCT registration profiles retrieved successfully",
      totalRecords: profiles.length,
      data: profiles,
    });
  } catch (error) {
    console.error("Get GCT registration profiles error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve GCT registration profiles",
      error: error.message,
    });
  }
};

const requireTaxConfigurationAdmin = (req) => {
  if (req.user?.role !== "Admin") {
    T.fail(
      "Only an administrator can change tax configuration.",
      403
    );
  }
};

const gctDate = (
  value,
  label,
  required = true
) => {
  if (
    !required &&
    (
      value === undefined ||
      value === null ||
      value === ""
    )
  ) {
    return null;
  }

  return new Date(
    `${T.date(value, label)}T12:00:00.000Z`
  );
};

const gctDateText = (value) =>
  value
    ? new Date(value)
        .toISOString()
        .slice(0, 10)
    : "";

const buildGctProfileValues = (
  body,
  entity
) => {
  const registrationStatus = T.text(
    body.registrationStatus ||
      "Not Registered",
    "Registration status"
  );

  if (
    ![
      "Not Registered",
      "Registration Review",
      "Application In Progress",
      "Registered",
      "Suspended",
      "Deregistered",
    ].includes(registrationStatus)
  ) {
    T.fail(
      "Invalid GCT registration status."
    );
  }

  const effectiveFrom = gctDate(
    body.effectiveFrom,
    "Profile effective-from date"
  );

  const effectiveTo = gctDate(
    body.effectiveTo,
    "Profile effective-to date",
    false
  );

  if (
    effectiveTo &&
    effectiveTo < effectiveFrom
  ) {
    T.fail(
      "Profile end date cannot precede its start."
    );
  }

  const thresholdFrom = gctDate(
    body.thresholdRuleEffectiveFrom,
    "Threshold effective-from date"
  );

  const thresholdTo = gctDate(
    body.thresholdRuleEffectiveTo,
    "Threshold effective-to date",
    false
  );

  if (
    thresholdTo &&
    thresholdTo < thresholdFrom
  ) {
    T.fail(
      "Threshold end date cannot precede its start."
    );
  }

  const currency = T.text(
    body.thresholdCurrency || "JMD",
    "Threshold currency"
  ).toUpperCase();

  if (currency !== "JMD") {
    T.fail(
      "This GCT configuration requires a JMD threshold."
    );
  }

  const monitoringMonths = Number(
    body.monitoringMonths ?? 12
  );

  if (
    !Number.isInteger(
      monitoringMonths
    ) ||
    monitoringMonths < 1 ||
    monitoringMonths > 120
  ) {
    T.fail(
      "Monitoring months must be a whole number between 1 and 120."
    );
  }

  if (
    body.monitoringEnabled !== undefined &&
    typeof body.monitoringEnabled !==
      "boolean"
  ) {
    T.fail(
      "Monitoring enabled must be true or false."
    );
  }

  const rawRate =
    body.standardRate ?? 0;

  if (
    !["number", "string"].includes(
      typeof rawRate
    ) ||
    (
      typeof rawRate === "string" &&
      !rawRate.trim()
    )
  ) {
    T.fail(
      "Standard rate must be a decimal between zero and one."
    );
  }

  const standardRate =
    Number(rawRate);

  if (
    !Number.isFinite(
      standardRate
    ) ||
    standardRate < 0 ||
    standardRate > 1
  ) {
    T.fail(
      "Standard rate must be a decimal between zero and one."
    );
  }

  const registrationNumber = T.text(
    body.registrationNumber ?? "",
    "GCT registration number",
    false
  );

  if (
    registrationStatus ===
      "Registered" &&
    !registrationNumber
  ) {
    T.fail(
      "A Registered GCT profile requires its registration number."
    );
  }

  const sourceVerifiedAt = gctDate(
    body.sourceVerifiedAt,
    "Source verification date",
    false
  );

  if (
    sourceVerifiedAt &&
    gctDateText(
      sourceVerifiedAt
    ) > T.today()
  ) {
    T.fail(
      "Source verification date cannot be in the future."
    );
  }

  return {
    entityCode:
      entity.entityCode,

    entityName:
      entity.legalName,

    businessType:
      entity.entityType,

    trn:
      entity.trn || "",

    taxType: "GCT",

    registrationStatus,

    registrationNumber:
      registrationStatus ===
      "Not Registered"
        ? ""
        : registrationNumber,

    effectiveFrom,
    effectiveTo,

    standardRate:
      registrationStatus ===
      "Not Registered"
        ? 0
        : standardRate,

    rateRuleCode: T.text(
      body.rateRuleCode ?? "",
      "Rate rule code",
      false
    ),

    turnoverThreshold: {
      amount: T.amount(
        body.thresholdAmount,
        "Turnover threshold",
        true
      ),

      currency,
      monitoringMonths,

      effectiveFrom:
        thresholdFrom,

      effectiveTo:
        thresholdTo,

      ruleCode: T.text(
        body.thresholdRuleCode,
        "Threshold rule code"
      ),
    },

    sourceName: T.text(
      body.sourceName ?? "",
      "Source name",
      false
    ),

    sourceUrl: T.text(
      body.sourceUrl ?? "",
      "Source URL",
      false
    ),

    sourceReference: T.text(
      body.sourceReference ?? "",
      "Source reference",
      false
    ),

    sourceVerifiedAt,

    monitoringEnabled:
      body.monitoringEnabled ??
      true,

    notes: T.text(
      body.notes ?? "",
      "Profile notes",
      false
    ),
  };
};

const createGctRegistrationProfile = T.handler(
  async (req, res) => {
    requireTaxConfigurationAdmin(req);

    const body = req.body || {};

    const registrationCode = T.text(
      body.registrationCode,
      "Registration profile code"
    ).toUpperCase();

    const entityCode = T.text(
      body.entityCode,
      "Business entity"
    ).toUpperCase();

    const data = await transact(
      async (session) => {
        const entity =
          await BusinessEntity.findOne({
            entityCode,
          }).session(session);

        if (!entity) {
          T.fail(
            "Business entity not found.",
            404
          );
        }

        const existing =
          await TaxRegistrationProfile.findOne({
            registrationCode,
          }).session(session);

        if (existing) {
          T.fail(
            "This registration profile code already exists.",
            409
          );
        }

        const values =
          buildGctProfileValues(
            body,
            entity
          );

        const [profile] =
          await TaxRegistrationProfile.create(
            [
              {
                ...values,
                registrationCode,
                status: "Draft",
                createdBy:
                  T.actor(req),
                updatedBy:
                  T.actor(req),
              },
            ],
            { session }
          );

        await writeAuditLog({
          req,
          session,
          action:
            "CREATE_GCT_PROFILE",
          module: "Tax Center",
          description:
            `Created ${registrationCode}`,
          targetType:
            "TaxRegistrationProfile",
          targetId:
            registrationCode,
          afterValues:
            profile.toObject(),
        });

        return profile;
      }
    );

    return res.status(201).json({
      success: true,
      message:
        "Draft GCT profile created. Business activation and invoice tax treatment were not changed.",
      data,
    });
  }
);

const updateDraftGctRegistrationProfile = T.handler(
  async (req, res) => {
    requireTaxConfigurationAdmin(req);

    const body = req.body || {};

    const registrationCode = T.text(
      req.params.registrationCode,
      "Registration profile code"
    ).toUpperCase();

    const data = await transact(
      async (session) => {
        const profile =
          await TaxRegistrationProfile.findOne({
            registrationCode,
            taxType: "GCT",
          }).session(session);

        if (!profile) {
          T.fail(
            "GCT profile not found.",
            404
          );
        }

        if (
          profile.status !== "Draft"
        ) {
          T.fail(
            "Only a Draft GCT profile can be edited.",
            409
          );
        }

        if (
          body.entityCode !== undefined &&
          T.text(
            body.entityCode,
            "Business entity"
          ).toUpperCase() !==
            profile.entityCode
        ) {
          T.fail(
            "A profile cannot be moved to another business.",
            409
          );
        }

        const entity =
          await BusinessEntity.findOne({
            entityCode:
              profile.entityCode,
          }).session(session);

        if (!entity) {
          T.fail(
            "Business entity not found.",
            404
          );
        }

        const beforeValues =
          profile.toObject();

        const existing = {
          registrationStatus:
            profile.registrationStatus,
          registrationNumber:
            profile.registrationNumber,

          effectiveFrom:
            gctDateText(
              profile.effectiveFrom
            ),

          effectiveTo:
            gctDateText(
              profile.effectiveTo
            ),

          standardRate:
            profile.standardRate,

          rateRuleCode:
            profile.rateRuleCode,

          thresholdAmount:
            profile.turnoverThreshold
              ?.amount,

          thresholdCurrency:
            profile.turnoverThreshold
              ?.currency,

          monitoringMonths:
            profile.turnoverThreshold
              ?.monitoringMonths,

          thresholdRuleEffectiveFrom:
            gctDateText(
              profile.turnoverThreshold
                ?.effectiveFrom
            ),

          thresholdRuleEffectiveTo:
            gctDateText(
              profile.turnoverThreshold
                ?.effectiveTo
            ),

          thresholdRuleCode:
            profile.turnoverThreshold
              ?.ruleCode,

          sourceName:
            profile.sourceName,

          sourceUrl:
            profile.sourceUrl,

          sourceReference:
            profile.sourceReference,

          sourceVerifiedAt:
            gctDateText(
              profile.sourceVerifiedAt
            ),

          monitoringEnabled:
            profile.monitoringEnabled,

          notes:
            profile.notes,
        };

        Object.assign(
          profile,

          buildGctProfileValues(
            {
              ...existing,
              ...body,
            },
            entity
          ),

          {
            updatedBy:
              T.actor(req),
          }
        );

        await profile.save({
          session,
        });

        await writeAuditLog({
          req,
          session,
          action:
            "UPDATE_DRAFT_GCT_PROFILE",
          module: "Tax Center",
          description:
            `Updated ${registrationCode}`,
          targetType:
            "TaxRegistrationProfile",
          targetId:
            registrationCode,
          beforeValues,
          afterValues:
            profile.toObject(),
        });

        return profile;
      }
    );

    return res.json({
      success: true,
      message:
        "Draft GCT profile updated.",
      data,
    });
  }
);

const activateGctRegistrationProfile = T.handler(
  async (req, res) => {
    requireTaxConfigurationAdmin(req);

    const registrationCode = T.text(
      req.params.registrationCode,
      "Registration profile code"
    ).toUpperCase();

    const data = await transact(
      async (session) => {
        const profile =
          await TaxRegistrationProfile.findOne({
            registrationCode,
            taxType: "GCT",
          }).session(session);

        if (!profile) {
          T.fail(
            "GCT profile not found.",
            404
          );
        }

        if (
          profile.status !== "Draft"
        ) {
          T.fail(
            "Only a Draft profile can be activated.",
            409
          );
        }

        const entity =
          await BusinessEntity.findOne({
            entityCode:
              profile.entityCode,
          }).session(session);

        if (
          !entity ||
          entity.entityType !==
            profile.businessType ||
          entity.legalName !==
            profile.entityName
        ) {
          T.fail(
            "Profile business details do not match the selected business.",
            409
          );
        }

        if (
          !profile.sourceName?.trim() ||
          (
            !profile.sourceUrl?.trim() &&
            !profile.sourceReference?.trim()
          ) ||
          !profile.sourceVerifiedAt
        ) {
          T.fail(
            "Verified source information is required before activation.",
            409
          );
        }

        if (
          profile.registrationStatus ===
            "Registered" &&
          (
            !profile.registrationNumber ||
            !profile.rateRuleCode
          )
        ) {
          T.fail(
            "A Registered profile requires its GCT registration number and rate rule reference.",
            409
          );
        }

        const overlapping =
          await TaxRegistrationProfile.findOne({
            _id: {
              $ne: profile._id,
            },

            entityCode:
              profile.entityCode,

            taxType: "GCT",
            status: "Active",

            effectiveFrom: {
              $lte:
                profile.effectiveTo ||
                new Date(
                  "9999-12-31T12:00:00.000Z"
                ),
            },

            $or: [
              { effectiveTo: null },
              {
                effectiveTo: {
                  $gte:
                    profile.effectiveFrom,
                },
              },
            ],
          }).session(session);

        if (overlapping) {
          T.fail(
            `This profile overlaps Active profile ${overlapping.registrationCode}. Existing profiles will not be changed automatically.`,
            409
          );
        }

        const beforeValues =
          profile.toObject();

        profile.status =
          "Active";

        profile.updatedBy =
          T.actor(req);

        await profile.save({
          session,
        });

        await writeAuditLog({
          req,
          session,
          action:
            "ACTIVATE_GCT_PROFILE",
          module: "Tax Center",
          description:
            `Activated ${registrationCode}`,
          targetType:
            "TaxRegistrationProfile",
          targetId:
            registrationCode,
          beforeValues,
          afterValues:
            profile.toObject(),
        });

        return profile;
      }
    );

    return res.json({
      success: true,
      message:
        "GCT profile activated. The operating business was not switched.",
      data,
    });
  }
);

const getGctTurnoverMonitor = T.handler(
  async (req, res) => {
    const entityCode = T.text(
      req.query.entityCode,
      "Business entity"
    ).toUpperCase();

    const asOfDate = req.query.asOfDate
      ? T.date(
          req.query.asOfDate,
          "As-of date"
        )
      : T.today();

    const result =
      await generateGctTurnoverMonitor({
        entityCode,
        asOfDate,
      });

    return res.json({
      success: true,

      message:
        "Business-specific GCT turnover monitor generated successfully.",

      filters: {
        entityCode,
        asOfDate,
      },

      data: result,
    });
  }
);

const getTaxCenterDashboard = T.handler(
  async (req, res) => {
    const scope = await S.fromQuery(req);

    const records = await TaxRecord.find({
      entityCode: scope.entityCode,
      periodKey: scope.periodKey,
      status: {
        $ne: "Cancelled",
      },
    }).lean();

    const includedStatuses = new Set([
      "Reviewed",
      "Approved",
      "Submitted",
      "Partially Paid",
      "Paid",
      "Reconciled",
      "Overdue",
    ]);

    const includedRecords = records.filter(
      (record) =>
        includedStatuses.has(record.status)
    );

    const sumRecords = (rows, field) =>
      T.round(
        rows.reduce(
          (total, record) =>
            total +
            T.amount(
              record[field] ?? 0,
              `${record.taxNumber}: ${field}`
            ),
          0
        )
      );

    const currentDate = T.today();

    const upcomingCutoff = new Date(
      `${currentDate}T12:00:00.000Z`
    );

    upcomingCutoff.setUTCDate(
      upcomingCutoff.getUTCDate() + 30
    );

    const cutoffDate = upcomingCutoff
      .toISOString()
      .slice(0, 10);

    const overdueRecords = [];
    const upcomingRecords = [];
    const missingDeadlineRecords = [];

    for (const record of includedRecords) {
      const balanceDue = T.amount(
        record.balanceDue ?? 0,
        `${record.taxNumber}: balance due`
      );

      if (balanceDue === 0) {
        continue;
      }

      if (!record.dueDate) {
        missingDeadlineRecords.push(record);
        continue;
      }

      const dueDate = T.date(
        record.dueDate,
        `${record.taxNumber}: due date`
      );

      if (dueDate < currentDate) {
        overdueRecords.push(record);
      } else if (dueDate <= cutoffDate) {
        upcomingRecords.push(record);
      }
    }

    const unfiledPeriodKeys = new Set(
      records
        .filter(
          (record) =>
            !record.filingReference ||
            !record.submittedAt
        )
        .map((record) => record.periodKey)
    );

    const payrollData =
      await getScopedTaxPayrollData(scope);

    const payrollScopeVerified =
      payrollData.unattributedPayrollNumbers
        .length === 0;

    return res.json({
      success: true,
      message:
        "Business-period Tax Center dashboard generated successfully.",

      filters: {
        entityCode: scope.entityCode,
        periodKey: scope.periodKey,
      },

      data: {
        currentLiabilities: sumRecords(
          includedRecords,
          "balanceDue"
        ),

        totalPaid: sumRecords(
          includedRecords,
          "amountPaid"
        ),

        totalTaxDue: sumRecords(
          includedRecords,
          "taxDue"
        ),

        taxRecordCount: records.length,

        calculatedObligationCount:
          records.filter(
            (record) =>
              record.status === "Calculated"
          ).length,

        overdueAmount: sumRecords(
          overdueRecords,
          "balanceDue"
        ),

        overdueObligationCount:
          overdueRecords.length,

        upcomingAmount: sumRecords(
          upcomingRecords,
          "balanceDue"
        ),

        upcomingDeadlineCount:
          upcomingRecords.length,

        unfiledPeriodCount:
          unfiledPeriodKeys.size,

        missingDueDateCount:
          missingDeadlineRecords.length,

        payrollGovernmentLiability:
          payrollScopeVerified
            ? payrollData.totals
                .totalGovernmentLiability
            : null,

        payrollDeductions:
          payrollScopeVerified
            ? payrollData.totals
                .totalEmployeeDeductions
            : null,

        payrollScopeVerified,

        attributedPayrollCount:
          payrollData.matchedPayroll.length,

        unattributedPayrollCount:
          payrollData
            .unattributedPayrollNumbers.length,

        unattributedPayrollNumbers:
          payrollData.unattributedPayrollNumbers,

        asOfDate: currentDate,

        notice:
          "Balances include reviewed and later obligations for the selected business and period. Calculated obligations remain available for review. Payroll totals are unavailable when employer attribution is unresolved. These figures do not establish filing completeness or bank reconciliation.",
      },
    });
  }
);

module.exports = {
  getTaxCenterDashboard,
  getTaxRecords,
  createTaxRecord,

  generatePayrollTaxSummary,
  generatePayrollLiabilities,

  transitionTaxRecordWorkflow,
  payTaxRecord,

  getTaxDeadlineRules,
  createTaxDeadlineRule,
  activateTaxDeadlineRule,
  applyTaxDeadlines,

  transitionGctFilingWorkflow,
  getGctFilingPeriods,
  calculateGctFilingPeriod,
  getGctFilingRegister,

  getGctRegistrationProfiles,
  createGctRegistrationProfile,
  updateDraftGctRegistrationProfile,
  activateGctRegistrationProfile,
  getGctTurnoverMonitor,
};