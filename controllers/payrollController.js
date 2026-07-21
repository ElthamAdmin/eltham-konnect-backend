const Payroll = require("../models/Payroll");
const HREmployee = require("../models/HREmployee");
const EmployeeCompensation = require("../models/EmployeeCompensation");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const { writeAuditLog } = require("../utils/auditLogger");
const { postPayrollPayment } = require("../services/accountingService");
const {
  calculateJamaicanPayroll,
  normalizePayrollDate,
  roundMoney,
} = require("../services/payrollCalculationService");

const {
  buildEmployeeAdvanceRecoveryPlan,
  applyEmployeeAdvanceRecoveries,
} = require("../services/employeeAdvanceService");

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const STATUTORY_TREATMENTS = [
  "Standard",
  "Employer-Assisted Net Pay",
  "Documented Exemption",
];

const COMPENSATION_TYPES = [
  "Salary",
  "Wage",
  "Stipend",
  "Allowance",
  "Other",
];

/*
 * H2 controlled compensation resolver.
 *
 * Employee payroll must use an Active, effective-dated Base Pay
 * compensation record. Legacy HREmployee.payRate is not used.
 *
 * Payroll without an employeeId remains available for controlled
 * manual or legacy processing.
 */
const resolvePayrollCompensation = async ({
  employeeId = "",
  calculationDate,
  requestedGrossPay = 0,
  requestedPayFrequency = "Monthly",
  requestedCompensationType = "Salary",
}) => {
  const normalizedEmployeeId = String(
    employeeId || ""
  ).trim();

  const resolvedAsOf =
    formatDateForComparison(calculationDate);

  if (!resolvedAsOf) {
    throw new Error(
      "A valid payroll calculation date is required."
    );
  }

  /*
   * Payroll not linked to an HR employee remains manual.
   * This preserves existing non-employee and legacy workflows.
   */
  if (!normalizedEmployeeId) {
    const manualGrossPay = roundMoney(
      requestedGrossPay
    );

    if (manualGrossPay <= 0) {
      throw new Error(
        "A valid gross pay amount is required for manual payroll."
      );
    }

    return {
      grossPay: manualGrossPay,
      payFrequency:
        requestedPayFrequency || "Monthly",
      compensationType:
        COMPENSATION_TYPES.includes(
          requestedCompensationType
        )
          ? requestedCompensationType
          : "Salary",
      compensationSource: "Manual",
      compensationRecord: null,
      compensationSnapshot: {
        compensationRecordId: null,
        compensationNumber: "",
        compensationCategory: "",
        compensationComponentCode: "",
        compensationComponentName: "",
        compensationAmount: manualGrossPay,
        compensationCurrency: "JMD",
        compensationRateUnit: "",
        compensationEffectiveFrom: null,
        compensationEffectiveTo: null,
        compensationResolvedAsOf:
          new Date(
            `${resolvedAsOf}T12:00:00.000Z`
          ),
      },
    };
  }

  const compensationRecord =
    await EmployeeCompensation.findOne({
      employeeId: normalizedEmployeeId,
      status: "Active",
      compensationCategory: "Base Pay",
      componentCode: "BASE_PAY",
      effectiveFrom: {
        $lte: resolvedAsOf,
      },
      $or: [
        {
          effectiveTo: "",
        },
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            $exists: false,
          },
        },
        {
          effectiveTo: {
            $gte: resolvedAsOf,
          },
        },
      ],
    }).sort({
      effectiveFrom: -1,
      createdAt: -1,
    });

  if (!compensationRecord) {
    throw new Error(
      `No Active Base Pay compensation record is effective for ` +
        `${normalizedEmployeeId} on ${resolvedAsOf}.`
    );
  }

  const controlledGrossPay = roundMoney(
    compensationRecord.amount
  );

  if (controlledGrossPay <= 0) {
    throw new Error(
      `Compensation ${compensationRecord.compensationNumber} ` +
        "does not contain a valid payable amount."
    );
  }

  const controlledPayFrequency = String(
    compensationRecord.payFrequency || ""
  ).trim();

  const controlledRateUnit = String(
    compensationRecord.rateUnit || ""
  ).trim();

  if (!controlledPayFrequency) {
    throw new Error(
      `Compensation ${compensationRecord.compensationNumber} ` +
        "does not contain a pay frequency."
    );
  }

  /*
   * H3 attendance will provide conversions for hourly, daily,
   * weekly and other rate-unit combinations. Until then, H2
   * permits direct payroll only where the rate unit and payroll
   * frequency agree.
   */
  if (
    controlledRateUnit &&
    controlledRateUnit !==
      controlledPayFrequency
  ) {
    throw new Error(
      `Compensation ${compensationRecord.compensationNumber} uses ` +
        `${controlledRateUnit} rates with ${controlledPayFrequency} payroll. ` +
        "Attendance-based conversion must be configured before payroll."
    );
  }

  const controlledCompensationType =
    COMPENSATION_TYPES.includes(
      compensationRecord.compensationType
    )
      ? compensationRecord.compensationType
      : "Other";

  return {
    grossPay: controlledGrossPay,
    payFrequency:
      controlledPayFrequency,
    compensationType:
      controlledCompensationType,
    compensationSource:
      "Compensation History",
    compensationRecord,
    compensationSnapshot: {
      compensationRecordId:
        compensationRecord._id,
      compensationNumber:
        compensationRecord.compensationNumber,
      compensationCategory:
        compensationRecord.compensationCategory,
      compensationComponentCode:
        compensationRecord.componentCode,
      compensationComponentName:
        compensationRecord.componentName,
      compensationAmount:
        controlledGrossPay,
      compensationCurrency:
        compensationRecord.currency || "JMD",
      compensationRateUnit:
        controlledRateUnit,
      compensationEffectiveFrom:
        compensationRecord.effectiveFrom
          ? new Date(
              `${compensationRecord.effectiveFrom}T12:00:00.000Z`
            )
          : null,
      compensationEffectiveTo:
        compensationRecord.effectiveTo
          ? new Date(
              `${compensationRecord.effectiveTo}T12:00:00.000Z`
            )
          : null,
      compensationResolvedAsOf:
        new Date(
          `${resolvedAsOf}T12:00:00.000Z`
        ),
    },
  };
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "true";
};

const getScheduledMonthlyPayDate = (payPeriod) => {
  const normalizedPeriod = String(
    payPeriod || ""
  ).trim();

  if (!/^\d{4}-\d{2}$/.test(normalizedPeriod)) {
    throw new Error(
      "Pay period must use the YYYY-MM format."
    );
  }

  const [yearValue, monthValue] =
    normalizedPeriod.split("-");

  const year = Number(yearValue);
  const monthIndex = Number(monthValue) - 1;

  const scheduledDate = new Date(
    Date.UTC(year, monthIndex, 25)
  );

  const scheduledDay = scheduledDate.getUTCDay();

  if ([0, 1, 6].includes(scheduledDay)) {
    while (scheduledDate.getUTCDay() !== 4) {
      scheduledDate.setUTCDate(
        scheduledDate.getUTCDate() - 1
      );
    }
  }

  return scheduledDate
    .toISOString()
    .slice(0, 10);
};

const getJamaicaToday = () => {
  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "America/Jamaica",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

    return `${values.year}-${values.month}-${values.day}`;
};

const formatDateForComparison = (value) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
};

const getMinimumWageRule = (payDate) => {
  const normalizedDate =
    formatDateForComparison(
      normalizePayrollDate(payDate)
    );

  const date = new Date(
    `${normalizedDate}T00:00:00.000Z`
  );

  if (date >= new Date("2026-07-01T00:00:00.000Z")) {
    return {
      ruleCode: "JM-NMW-2026-07",
      hourlyRate: 425,
      weeklyRate: 17000,
    };
  }

  if (date >= new Date("2025-06-01T00:00:00.000Z")) {
    return {
      ruleCode: "JM-NMW-2025-06",
      hourlyRate: 400,
      weeklyRate: 16000,
    };
  }

  if (date >= new Date("2024-06-01T00:00:00.000Z")) {
    return {
      ruleCode: "JM-NMW-2024-06",
      hourlyRate: 375,
      weeklyRate: 15000,
    };
  }

  return {
    ruleCode: "JM-NMW-HISTORICAL-REVIEW",
    hourlyRate: 0,
    weeklyRate: 0,
  };
};

const buildMinimumWageAssessment = ({
  payDate,
  workedHours,
  grossPay,
  applicable = true,
}) => {
  const rule = getMinimumWageRule(
    payDate
  );

  const safeWorkedHours = Math.max(
    0,
    Number(workedHours || 0)
  );

  const assessedGrossPay =
    roundMoney(grossPay);

  const canAssess =
    applicable &&
    rule.hourlyRate > 0 &&
    safeWorkedHours > 0;

  const minimumGrossPay = canAssess
    ? roundMoney(
        safeWorkedHours *
          rule.hourlyRate
      )
    : 0;

  const shortfall = canAssess
    ? Math.max(
        0,
        roundMoney(
          minimumGrossPay -
            assessedGrossPay
        )
      )
    : 0;

  let compliant = false;
  let assessmentStatus =
    "Not Assessed";
  let warning = "";

  if (!applicable) {
    compliant = true;
    assessmentStatus =
      "Not Applicable";
    warning =
      "Minimum-wage assessment was marked as not applicable for this Payroll record.";
  } else if (rule.hourlyRate <= 0) {
    compliant = false;
    assessmentStatus =
      "Not Assessed";
    warning =
      "Minimum-wage compliance could not be assessed because no effective wage rule was available for the payment date.";
  } else if (safeWorkedHours <= 0) {
    compliant = false;
    assessmentStatus =
      "Not Assessed";
    warning =
      "Minimum-wage compliance could not be assessed because worked hours were not supplied.";
  } else if (shortfall > 0) {
    compliant = false;
    assessmentStatus =
      "Non-Compliant";
    warning =
      `Entered gross pay is JMD ${shortfall.toFixed(
        2
      )} below the ` +
      `minimum ordinary-time pay calculated from ${safeWorkedHours.toFixed(
        2
      )} hours at JMD ${rule.hourlyRate.toFixed(
        2
      )} per hour.`;
  } else {
    compliant = true;
    assessmentStatus =
      "Compliant";
  }

  return {
    applicable,
    hourlyRate:
      rule.hourlyRate,
    workedHours:
      roundMoney(safeWorkedHours),
    minimumGrossPay,
    assessedGrossPay,
    shortfall,
    compliant,
    assessmentStatus,
    warning,
    ruleCode:
      rule.ruleCode,
    assessedAt: new Date(),
  };
};

const calculateEmployerAssistedPayroll = async ({
  baseGrossPay,
  targetNetPay,
  pensionEmployee,
  payPeriod,
  payDate,
  payFrequency,
  priorYtdNisInsurablePay = 0,
}) => {
  const calculatePayroll = (
    calculationInput
  ) =>
    calculateJamaicanPayroll({
      ...calculationInput,
      priorYtdNisInsurablePay,
    });
  const safeBaseGrossPay =
    roundMoney(baseGrossPay);

  const safeTargetNetPay = roundMoney(
    Number(targetNetPay || 0) > 0
      ? targetNetPay
      : safeBaseGrossPay
  );

  let lowerGrossPay = Math.max(
    safeBaseGrossPay,
    safeTargetNetPay
  );

  let upperGrossPay = lowerGrossPay;

  let upperCalculation =
    await calculatePayroll({
      grossPay: upperGrossPay,
      pensionEmployee,
      payPeriod,
      payDate,
      payFrequency,
    });

  let expansionAttempts = 0;

  while (
    roundMoney(upperCalculation.netPay) <
      safeTargetNetPay &&
    expansionAttempts < 25
  ) {
    upperGrossPay = roundMoney(
      upperGrossPay * 1.25 + 1
    );

    upperCalculation =
      await calculatePayroll({
        grossPay: upperGrossPay,
        pensionEmployee,
        payPeriod,
        payDate,
        payFrequency,
      });

    expansionAttempts += 1;
  }

  if (
    roundMoney(upperCalculation.netPay) <
    safeTargetNetPay
  ) {
    throw new Error(
      "Could not calculate the employer-assisted gross pay."
    );
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const midpoint = roundMoney(
      (lowerGrossPay + upperGrossPay) / 2
    );

    const midpointCalculation =
      await calculatePayroll({
        grossPay: midpoint,
        pensionEmployee,
        payPeriod,
        payDate,
        payFrequency,
      });

    if (
      roundMoney(midpointCalculation.netPay) >=
      safeTargetNetPay
    ) {
      upperGrossPay = midpoint;
      upperCalculation = midpointCalculation;
    } else {
      lowerGrossPay = roundMoney(midpoint + 0.01);
    }

    if (
      roundMoney(
        upperGrossPay - lowerGrossPay
      ) <= 0.01
    ) {
      break;
    }
  }

  let finalGrossPay = upperGrossPay;

  let finalCalculation =
    await calculatePayroll({
      grossPay: finalGrossPay,
      pensionEmployee,
      payPeriod,
      payDate,
      payFrequency,
    });

  while (
    roundMoney(finalCalculation.netPay) <
    safeTargetNetPay
  ) {
    finalGrossPay = roundMoney(
      finalGrossPay + 0.01
    );

    finalCalculation =
      await calculatePayroll({
        grossPay: finalGrossPay,
        pensionEmployee,
        payPeriod,
        payDate,
        payFrequency,
      });
  }

  const employerSupportAllowance =
    roundMoney(
      finalGrossPay - safeBaseGrossPay
    );

  if (
    employerSupportAllowance <= 0 &&
    roundMoney(finalCalculation.netPay) <
      safeTargetNetPay
  ) {
    throw new Error(
      "Employer-assisted payroll did not preserve the requested take-home amount."
    );
  }

  return {
    calculation: finalCalculation,
    targetNetPay: safeTargetNetPay,
    employerSupportAllowance,
  };
};

const applyDocumentedExemption = (calculation) => {
  const exemptCalculation = {
    ...calculation,
    nisEmployee: 0,
    nhtEmployee: 0,
    educationTax: 0,
    incomeTax: 0,
    pensionEmployee: 0,
    totalEmployeeDeductions: 0,
    totalDeductions: 0,
    nisEmployer: 0,
    nhtEmployer: 0,
    educationTaxEmployer: 0,
    heartEmployer: 0,
    totalEmployerContributions: 0,
  };

  exemptCalculation.netPay = roundMoney(
    exemptCalculation.grossPay
  );

  exemptCalculation.totalPayrollCost = roundMoney(
    exemptCalculation.grossPay
  );

  return exemptCalculation;
};

const validateStatutorySelection = ({
  statutoryTreatment,
  compensationType,
  statutoryExemption,
  user,
}) => {
  if (!STATUTORY_TREATMENTS.includes(statutoryTreatment)) {
    throw new Error("Invalid statutory treatment selected.");
  }

  if (!COMPENSATION_TYPES.includes(compensationType)) {
    throw new Error("Invalid compensation type selected.");
  }

  if (statutoryTreatment !== "Documented Exemption") {
    return;
  }

  if (user?.role !== "Admin") {
    throw new Error(
      "Only an administrator can authorize a documented statutory exemption."
    );
  }

  const reason = String(
    statutoryExemption?.reason || ""
  ).trim();

  const legalBasis = String(
    statutoryExemption?.legalBasis || ""
  ).trim();

  const supportingReference = String(
    statutoryExemption?.supportingReference || ""
  ).trim();

  if (!reason || !legalBasis || !supportingReference) {
    throw new Error(
      "A documented exemption requires a reason, legal basis, and supporting reference."
    );
  }
};

const getPriorYtdNisContext = async ({
  employeeId,
  payDate,
}) => {
  const normalizedEmployeeId =
    String(
      employeeId || ""
    ).trim();

  if (!normalizedEmployeeId) {
    return {
      priorYtdNisInsurablePay: 0,
      includedPayrollNumbers: [],
    };
  }

  const calculationDate =
    normalizePayrollDate(payDate);

  const year =
    calculationDate.getUTCFullYear();

  const yearStart = new Date(
    Date.UTC(year, 0, 1)
  );

  const priorPayrolls =
    await Payroll.find({
      employeeId:
        normalizedEmployeeId,
      status: {
        $in: [
          "Approved",
          "Paid",
        ],
      },
      payDate: {
        $gte: yearStart,
        $lt: calculationDate,
      },
      statutoryRuleCode: {
        $ne: "",
      },
    })
      .select(
        "payrollNumber nisInsurablePay"
      )
      .lean();

  const priorYtdNisInsurablePay =
    priorPayrolls.reduce(
      (total, payroll) =>
        roundMoney(
          total +
            Number(
              payroll.nisInsurablePay ||
                0
            )
        ),
      0
    );

  return {
    priorYtdNisInsurablePay,
    includedPayrollNumbers:
      priorPayrolls
        .map(
          (payroll) =>
            payroll.payrollNumber
        )
        .filter(Boolean),
  };
};

const buildPayrollReportFilter = async (query = {}) => {
  const filter = {};

  if (query.employeeId) {
    filter.employeeId = String(
      query.employeeId
    ).trim();
  }

  if (query.status) {
    filter.status = String(query.status).trim();
  } else {
    filter.status = {
      $nin: ["Cancelled", "Reversed"],
    };
  }

  if (query.payPeriod) {
    filter.payPeriod = String(
      query.payPeriod
    ).trim();
  } else if (
    query.periodFrom ||
    query.periodTo
  ) {
    filter.payPeriod = {};

    if (query.periodFrom) {
      filter.payPeriod.$gte = String(
        query.periodFrom
      ).trim();
    }

    if (query.periodTo) {
      filter.payPeriod.$lte = String(
        query.periodTo
      ).trim();
    }
  }

  if (query.compensationType) {
    filter.compensationType = String(
      query.compensationType
    ).trim();
  }

  if (query.statutoryTreatment) {
    filter.statutoryTreatment = String(
      query.statutoryTreatment
    ).trim();
  }

  if (query.legacy === "true") {
    filter.statutoryRuleCode = {
      $in: ["", null],
    };
  }

  if (query.legacy === "false") {
    filter.statutoryRuleCode = {
      $nin: ["", null],
    };
  }

  if (query.search) {
    const safeSearch = String(query.search)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.$or = [
      {
        employeeName: {
          $regex: safeSearch,
          $options: "i",
        },
      },
      {
        employeeId: {
          $regex: safeSearch,
          $options: "i",
        },
      },
      {
        payrollNumber: {
          $regex: safeSearch,
          $options: "i",
        },
      },
    ];
  }

  if (query.branch) {
    const employees = await HREmployee.find({
      branch: String(query.branch).trim(),
    })
      .select("employeeId")
      .lean();

    const branchEmployeeIds = employees.map(
      (employee) => employee.employeeId
    );

    if (
      filter.employeeId &&
      !branchEmployeeIds.includes(
        filter.employeeId
      )
    ) {
      filter.employeeId = {
        $in: [],
      };
    } else if (!filter.employeeId) {
      filter.employeeId = {
        $in: branchEmployeeIds,
      };
    }
  }

  return filter;
};

const buildPayrollTotals = (records = []) =>
  records.reduce(
    (totals, payroll) => {
      const status =
        payroll.status || "Pending";

      totals.recordCount += 1;

      totals.statusCounts[status] =
        Number(
          totals.statusCounts[status] || 0
        ) + 1;

      totals.grossPay = roundMoney(
        totals.grossPay +
          Number(payroll.grossPay || 0)
      );

      totals.employerSupportAllowance =
        roundMoney(
          totals.employerSupportAllowance +
            Number(
              payroll.employerSupportAllowance ||
                0
            )
        );

      totals.nisEmployee = roundMoney(
        totals.nisEmployee +
          Number(payroll.nisEmployee || 0)
      );

      totals.nhtEmployee = roundMoney(
        totals.nhtEmployee +
          Number(payroll.nhtEmployee || 0)
      );

      totals.educationTaxEmployee =
        roundMoney(
          totals.educationTaxEmployee +
            Number(payroll.educationTax || 0)
        );

      totals.paye = roundMoney(
        totals.paye +
          Number(payroll.incomeTax || 0)
      );

      totals.pensionEmployee = roundMoney(
        totals.pensionEmployee +
          Number(
            payroll.pensionEmployee || 0
          )
      );

      totals.totalEmployeeDeductions =
        roundMoney(
          totals.totalEmployeeDeductions +
            Number(
              payroll.totalDeductions ??
                payroll.deductions ??
                0
            )
        );

      totals.netPayBeforeAdvance =
        roundMoney(
          totals.netPayBeforeAdvance +
            Number(
              payroll.netPayBeforeAdvance ??
                payroll.netPay ??
                0
            )
        );

      totals.advanceRecovery = roundMoney(
        totals.advanceRecovery +
          Number(payroll.advanceRecovery || 0)
      );

      totals.netPay = roundMoney(
        totals.netPay +
          Number(payroll.netPay || 0)
      );

      totals.nisEmployer = roundMoney(
        totals.nisEmployer +
          Number(payroll.nisEmployer || 0)
      );

      totals.nhtEmployer = roundMoney(
        totals.nhtEmployer +
          Number(payroll.nhtEmployer || 0)
      );

      totals.educationTaxEmployer =
        roundMoney(
          totals.educationTaxEmployer +
            Number(
              payroll.educationTaxEmployer ||
                0
            )
        );

      totals.heartEmployer = roundMoney(
        totals.heartEmployer +
          Number(payroll.heartEmployer || 0)
      );

      totals.totalEmployerContributions =
        roundMoney(
          totals.totalEmployerContributions +
            Number(
              payroll.totalEmployerContributions ||
                0
            )
        );

            const recordedPayrollCost = Number(
        payroll.totalPayrollCost || 0
      );

      const payrollCost =
        recordedPayrollCost > 0
          ? recordedPayrollCost
          : roundMoney(
              Number(payroll.grossPay || 0) +
                Number(
                  payroll.totalEmployerContributions ||
                    0
                )
            );

      totals.totalPayrollCost = roundMoney(
        totals.totalPayrollCost +
          payrollCost
      );

      if (!payroll.statutoryRuleCode) {
        totals.legacyRecordCount += 1;
      }

      return totals;
    },
    {
      recordCount: 0,
      legacyRecordCount: 0,
      statusCounts: {},
      grossPay: 0,
      employerSupportAllowance: 0,
      nisEmployee: 0,
      nhtEmployee: 0,
      educationTaxEmployee: 0,
      paye: 0,
      pensionEmployee: 0,
      totalEmployeeDeductions: 0,
      netPayBeforeAdvance: 0,
      advanceRecovery: 0,
      netPay: 0,
      nisEmployer: 0,
      nhtEmployer: 0,
      educationTaxEmployer: 0,
      heartEmployer: 0,
      totalEmployerContributions: 0,
      totalPayrollCost: 0,
    }
  );

const addGovernmentLiabilities = (
  totals = {}
) => ({
  ...totals,

  governmentLiabilities: {
    nis: roundMoney(
      Number(totals.nisEmployee || 0) +
        Number(totals.nisEmployer || 0)
    ),

    nht: roundMoney(
      Number(totals.nhtEmployee || 0) +
        Number(totals.nhtEmployer || 0)
    ),

    educationTax: roundMoney(
      Number(
        totals.educationTaxEmployee || 0
      ) +
        Number(
          totals.educationTaxEmployer || 0
        )
    ),

    paye: roundMoney(
      totals.paye || 0
    ),

    heart: roundMoney(
      totals.heartEmployer || 0
    ),

    pension: roundMoney(
      totals.pensionEmployee || 0
    ),

    total: roundMoney(
      Number(totals.nisEmployee || 0) +
        Number(totals.nisEmployer || 0) +
        Number(totals.nhtEmployee || 0) +
        Number(totals.nhtEmployer || 0) +
        Number(
          totals.educationTaxEmployee || 0
        ) +
        Number(
          totals.educationTaxEmployer || 0
        ) +
        Number(totals.paye || 0) +
        Number(totals.heartEmployer || 0) +
        Number(
          totals.pensionEmployee || 0
        )
    ),
  },
});

const getPayrollRegister = async (req, res) => {
  try {
    const filter =
      await buildPayrollReportFilter(
        req.query
      );

    const limit = Math.min(
      1000,
      Math.max(
        1,
        Number(req.query.limit || 500)
      )
    );

    const [records, totalRecords] =
      await Promise.all([
        Payroll.find(filter)
          .sort({
            payDate: -1,
            createdAt: -1,
            _id: -1,
          })
          .limit(limit)
          .lean(),

        Payroll.countDocuments(filter),
      ]);

    const totals = addGovernmentLiabilities(
      buildPayrollTotals(records)
    );

    return res.json({
      success: true,
      message:
        "Payroll register generated successfully",
      filters: {
        employeeId:
          req.query.employeeId || "",
        status: req.query.status || "",
        payPeriod:
          req.query.payPeriod || "",
        periodFrom:
          req.query.periodFrom || "",
        periodTo:
          req.query.periodTo || "",
        branch: req.query.branch || "",
        compensationType:
          req.query.compensationType || "",
        statutoryTreatment:
          req.query.statutoryTreatment || "",
        legacy: req.query.legacy || "",
        search: req.query.search || "",
      },
      totalRecords,
      returnedRecords: records.length,
      totals,
      data: records,
    });
  } catch (error) {
    console.error(
      "Payroll register error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not generate Payroll register",
      error: error.message,
    });
  }
};

const getEmployeePayrollYtd = async (
  req,
  res
) => {
  try {
    const employeeId = String(
      req.params.employeeId || ""
    ).trim();

    const jamaicaYear = Number(
      getJamaicaToday().slice(0, 4)
    );

    const year = Number(
      req.query.year || jamaicaYear
    );

    if (
      !employeeId ||
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid employee ID and year are required",
      });
    }

    const statuses =
      req.query.includeApproved === "true"
        ? ["Paid", "Approved"]
        : ["Paid"];

    const employee = await HREmployee.findOne({
      employeeId,
    })
      .select(
        "employeeId fullName jobTitle department branch employmentStatus payType payRate"
      )
      .lean();

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const records = await Payroll.find({
      employeeId,
      payPeriod: {
        $regex: `^${year}-`,
      },
      status: {
        $in: statuses,
      },
    })
      .sort({
        payPeriod: 1,
        payDate: 1,
        createdAt: 1,
      })
      .lean();

    const totals = addGovernmentLiabilities(
      buildPayrollTotals(records)
    );

    return res.json({
      success: true,
      message:
        "Employee year-to-date Payroll generated successfully",
      year,
      includedStatuses: statuses,
      employee,
      totals,
      data: records,
    });
  } catch (error) {
    console.error(
      "Employee Payroll YTD error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not generate employee Payroll YTD",
      error: error.message,
    });
  }
};

const reassessPayrollCompliance = async (
  req,
  res
) => {
  try {
    const { payrollNumber } = req.params;

    const payroll = await Payroll.findOne({
      payrollNumber,
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    if (
      !["Pending", "Approved"].includes(
        payroll.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only Pending or Approved Payroll can be reassessed",
      });
    }

    const workedHours = Number(
      req.body.workedHours ??
        payroll.minimumWageAssessment
          ?.workedHours ??
        0
    );

    const beforeValues = {
      minimumWageAssessment:
        payroll.minimumWageAssessment,
    };

    payroll.minimumWageAssessment =
      buildMinimumWageAssessment({
        payDate:
          payroll.payDate ||
          payroll.payPeriod,
        workedHours,
        grossPay: payroll.grossPay,
        applicable:
          payroll.minimumWageAssessment
            ?.applicable !== false,
      });

    await payroll.save();

    try {
      await writeAuditLog({
        req,
        action:
          "REASSESS_PAYROLL_COMPLIANCE",
        module: "Payroll",
        description:
          `Minimum-wage compliance reassessed for ` +
          `${payroll.payrollNumber}`,
        targetType: "Payroll",
        targetId: payroll.payrollNumber,
        beforeValues,
        afterValues: {
          minimumWageAssessment:
            payroll.minimumWageAssessment,
        },
        metadata: {
          employeeId: payroll.employeeId,
          employeeName:
            payroll.employeeName,
          payPeriod: payroll.payPeriod,
          payDate: payroll.payDate,
          workedHours,
          grossPay: payroll.grossPay,
        },
      });
    } catch (auditError) {
      console.error(
        "Payroll compliance reassessment audit error:",
        auditError
      );
    }

    return res.json({
      success: true,
      message:
        "Payroll compliance reassessed successfully",
      data: payroll,
    });
  } catch (error) {
    console.error(
      "Payroll compliance reassessment error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not reassess Payroll compliance",
      error: error.message,
    });
  }
};

const getPayroll = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.employeeId) {
      filter.employeeId = String(req.query.employeeId).trim();
    }

    if (req.query.payPeriod) {
      filter.payPeriod = String(req.query.payPeriod).trim();
    }

    if (req.query.status) {
      filter.status = String(req.query.status).trim();
    }

    const [total, payroll] = await Promise.all([
      Payroll.countDocuments(filter),
      Payroll.find(filter)
        .sort({ payDate: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    res.json({
      success: true,
      message: "Payroll records retrieved successfully",
      totalPayroll: total,
      data: payroll,
      pagination: {
        total,
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
        limit,
      },
    });
  } catch (error) {
    console.error("Error getting payroll:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve payroll records",
      error: error.message,
    });
  }
};

const getMyPayroll = async (req, res) => {
  try {
    const linkedEmployeeId = req.user?.linkedEmployeeId || "";
    const userId = req.user?.userId || "";
    let employee = null;

    if (linkedEmployeeId) {
      employee = await HREmployee.findOne({ employeeId: linkedEmployeeId });
    }

    if (!employee && userId) {
      employee = await HREmployee.findOne({ linkedUserId: userId });
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "No HR employee profile is linked to this user",
      });
    }

    const payroll = await Payroll.find({ employeeId: employee.employeeId }).sort({
      payDate: -1,
      createdAt: -1,
      _id: -1,
    });

    return res.json({
      success: true,
      message: "My payroll records retrieved successfully",
      data: payroll,
    });
  } catch (error) {
    console.error("Error getting my payroll:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve my payroll records",
      error: error.message,
    });
  }
};

const previewPayroll = async (req, res) => {
  try {
    const {
      grossPay,
      pensionEmployee = 0,
      payPeriod,
      payDate,
      payFrequency = "Monthly",
      employeeId = "",
      compensationType = "Salary",
      statutoryTreatment = "Standard",
      targetNetPay = 0,
      statutoryExemption = {},
      workedHours = 0,
      minimumWageApplicable = true,
      applyEmployeeAdvances = true,
      requestedAdvanceRecovery,
    } = req.body;

        if (
      !payPeriod ||
      (
        !String(employeeId || "").trim() &&
        Number(grossPay || 0) <= 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Pay period is required. Gross pay is also required for manual payroll.",
      });
    }

    const normalizedStatutoryTreatment =
      STATUTORY_TREATMENTS.includes(
        statutoryTreatment
      )
        ? statutoryTreatment
        : "Standard";

    /*
     * Establish an initial calculation date so the effective
     * compensation record can be resolved.
     */
    const requestedPayFrequency =
      payFrequency || "Monthly";

    const initialScheduledPayDate =
      requestedPayFrequency === "Monthly"
        ? getScheduledMonthlyPayDate(
            payPeriod
          )
        : normalizePayrollDate(
            payDate || payPeriod
          );

    const initialCalculationDate =
      normalizePayrollDate(
        initialScheduledPayDate
      );

    let resolvedCompensation =
      await resolvePayrollCompensation({
        employeeId,
        calculationDate:
          initialCalculationDate,
        requestedGrossPay: grossPay,
        requestedPayFrequency,
        requestedCompensationType:
          compensationType,
      });

    let finalPayFrequency =
      resolvedCompensation.payFrequency;

    let scheduledPayDate =
      finalPayFrequency === "Monthly"
        ? getScheduledMonthlyPayDate(
            payPeriod
          )
        : normalizePayrollDate(
            payDate || payPeriod
          );

    let calculationDate =
      normalizePayrollDate(
        scheduledPayDate
      );

    /*
     * If resolving compensation changed the payroll frequency,
     * resolve it again using the final payroll calculation date.
     */
    if (
      formatDateForComparison(
        calculationDate
      ) !==
      formatDateForComparison(
        initialCalculationDate
      )
    ) {
      resolvedCompensation =
        await resolvePayrollCompensation({
          employeeId,
          calculationDate,
          requestedGrossPay: grossPay,
          requestedPayFrequency:
            finalPayFrequency,
          requestedCompensationType:
            compensationType,
        });

      finalPayFrequency =
        resolvedCompensation.payFrequency;

      scheduledPayDate =
        finalPayFrequency === "Monthly"
          ? getScheduledMonthlyPayDate(
              payPeriod
            )
          : normalizePayrollDate(
              payDate || payPeriod
            );

      calculationDate =
        normalizePayrollDate(
          scheduledPayDate
        );
    }

    const resolvedGrossPay =
      resolvedCompensation.grossPay;

    const normalizedCompensationType =
      resolvedCompensation.compensationType;

    validateStatutorySelection({
      statutoryTreatment:
        normalizedStatutoryTreatment,
      compensationType:
        normalizedCompensationType,
      statutoryExemption,
      user: req.user,
    });

    const ytdNisContext =
      await getPriorYtdNisContext({
        employeeId,
        payDate:
          calculationDate,
      });

    let calculation;
    let finalTargetNetPay = 0;
    let employerSupportAllowance = 0;

    if (
      normalizedStatutoryTreatment ===
      "Employer-Assisted Net Pay"
    ) {
      const assistedResult =
        await calculateEmployerAssistedPayroll({
          baseGrossPay: resolvedGrossPay,
          targetNetPay,
          pensionEmployee: Number(pensionEmployee || 0),
          payPeriod,
          payDate: calculationDate,
                    payFrequency:
            finalPayFrequency,
          priorYtdNisInsurablePay:
            ytdNisContext
              .priorYtdNisInsurablePay,
        });

      calculation = assistedResult.calculation;
      finalTargetNetPay = assistedResult.targetNetPay;
      employerSupportAllowance =
        assistedResult.employerSupportAllowance;
    } else {
            calculation = await calculateJamaicanPayroll({
        grossPay: resolvedGrossPay,
        pensionEmployee,
        payPeriod,
        payDate: calculationDate,
        payFrequency:
          finalPayFrequency,
        priorYtdNisInsurablePay:
          ytdNisContext
            .priorYtdNisInsurablePay,
      });
    }

    if (
      normalizedStatutoryTreatment ===
      "Documented Exemption"
    ) {
      calculation = applyDocumentedExemption(calculation);
    }

    const applyEmployeeStatutoryDeductions =
      normalizedStatutoryTreatment !==
      "Documented Exemption";

    const applyEmployerStatutoryContributions =
      normalizedStatutoryTreatment !==
      "Documented Exemption";

    const minimumWageAssessment =
      buildMinimumWageAssessment({
        payDate: calculationDate,
        workedHours,
        grossPay: calculation.grossPay,
        applicable: normalizeBoolean(
          minimumWageApplicable,
          true
        ),
      });

    const shouldApplyAdvances = normalizeBoolean(
      applyEmployeeAdvances,
      true
    );

    const recoveryPlan = shouldApplyAdvances
      ? await buildEmployeeAdvanceRecoveryPlan({
          employeeId,
          payPeriod,
          availableNetPay: calculation.netPay,
          requestedRecoveryAmount:
            requestedAdvanceRecovery,
        })
      : {
          totalAdvanceRecovery: 0,
          allocations: [],
        };

    const netPayBeforeAdvance = calculation.netPay;

    const finalNetPay = roundMoney(
      netPayBeforeAdvance -
        recoveryPlan.totalAdvanceRecovery
    );

    return res.json({
      success: true,
      message: "Payroll preview calculated successfully",
      data: {
                ...calculation,
        ytdNisContext: {
          priorYtdNisInsurablePay:
            ytdNisContext
              .priorYtdNisInsurablePay,
          includedPayrollNumbers:
            ytdNisContext
              .includedPayrollNumbers,
        },
                scheduledPayDate,
        payDate: scheduledPayDate,
        payFrequency:
          finalPayFrequency,

        compensationType:
          normalizedCompensationType,

        compensationSource:
          resolvedCompensation
            .compensationSource,

        compensationNumber:
          resolvedCompensation
            .compensationSnapshot
            .compensationNumber,

        compensationCategory:
          resolvedCompensation
            .compensationSnapshot
            .compensationCategory,

        compensationComponentCode:
          resolvedCompensation
            .compensationSnapshot
            .compensationComponentCode,

        compensationComponentName:
          resolvedCompensation
            .compensationSnapshot
            .compensationComponentName,

        compensationAmount:
          resolvedCompensation
            .compensationSnapshot
            .compensationAmount,

        compensationCurrency:
          resolvedCompensation
            .compensationSnapshot
            .compensationCurrency,

        compensationRateUnit:
          resolvedCompensation
            .compensationSnapshot
            .compensationRateUnit,

        compensationEffectiveFrom:
          resolvedCompensation
            .compensationSnapshot
            .compensationEffectiveFrom,

        compensationEffectiveTo:
          resolvedCompensation
            .compensationSnapshot
            .compensationEffectiveTo,

        compensationResolvedAsOf:
          resolvedCompensation
            .compensationSnapshot
            .compensationResolvedAsOf,

        statutoryTreatment:
          normalizedStatutoryTreatment,
        applyEmployeeStatutoryDeductions,
        applyEmployerStatutoryContributions,
        targetNetPay: finalTargetNetPay,
        employerSupportAllowance,
        minimumWageAssessment,
        netPayBeforeAdvance,
        advanceRecovery:
          recoveryPlan.totalAdvanceRecovery,
        advanceRecoveries:
          recoveryPlan.allocations,
        netPay: finalNetPay,
      },
    });
  } catch (error) {
    console.error("Error previewing Payroll:", error);

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Could not calculate Payroll preview",
    });
  }
};

const createPayroll = async (req, res) => {
  try {
    const {
      employeeId,
      employeeName,
      role,
      payPeriod,
      payDate,
      payFrequency,
      grossPay,
      pensionEmployee = 0,
      paidFromAccountNumber,
      compensationType = "Salary",
      statutoryTreatment = "Standard",
      targetNetPay = 0,
      statutoryExemption = {},
      workedHours = 0,
      applyEmployeeAdvances = true,
      requestedAdvanceRecovery,
    } = req.body;

        if (
      !payPeriod ||
      !paidFromAccountNumber ||
      (
        !String(employeeId || "").trim() &&
        Number(grossPay || 0) <= 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Pay period and payment account are required. " +
          "Gross pay is also required for manual payroll.",
      });
    }

        let normalizedCompensationType =
      COMPENSATION_TYPES.includes(
        compensationType
      )
        ? compensationType
        : "Salary";

    const normalizedStatutoryTreatment =
      STATUTORY_TREATMENTS.includes(statutoryTreatment)
        ? statutoryTreatment
        : "Standard";

    let finalEmployeeId = "";
    let finalEmployeeName = String(
      employeeName || ""
    ).trim();
    let finalRole = String(role || "").trim();
    let finalPayFrequency =
      payFrequency || "Monthly";

        let enteredGrossPay = roundMoney(
      grossPay
    );

    if (employeeId) {
      const employee = await HREmployee.findOne({
        employeeId,
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Selected employee not found",
        });
      }

      if (employee.employmentStatus !== "Active") {
        return res.status(400).json({
          success: false,
          message:
            "Payroll can only be created for an active employee",
        });
      }

      if (employee.payrollEnabled === false) {
        return res.status(400).json({
          success: false,
          message:
            "Payroll is disabled for the selected employee",
        });
      }

      finalEmployeeId = employee.employeeId;
      finalEmployeeName = employee.fullName;
      finalRole = employee.jobTitle;

      if (!payFrequency) {
        finalPayFrequency =
          employee.payType === "Weekly Wage"
            ? "Weekly"
            : "Monthly";
      }
    }

    if (!finalEmployeeName || !finalRole) {
      return res.status(400).json({
        success: false,
        message: "Employee name and role are required",
      });
    }

    const duplicatePayroll = finalEmployeeId
      ? await Payroll.findOne({
          employeeId: finalEmployeeId,
          payPeriod,
          status: {
            $nin: ["Reversed", "Cancelled"],
          },
        })
      : null;

    if (duplicatePayroll) {
      return res.status(409).json({
        success: false,
        message:
          `${finalEmployeeName} already has Payroll ` +
          `${duplicatePayroll.payrollNumber} for ${payPeriod}`,
      });
    }

    const selectedFinancialAccount =
      await FinancialAccount.findOne({
        accountNumber: paidFromAccountNumber,
        status: "Active",
        accountType: {
          $in: ["Bank", "Cash"],
        },
      });

    if (!selectedFinancialAccount) {
      return res.status(404).json({
        success: false,
        message:
          "Select an active Bank or Cash account for Payroll payment",
      });
    }

    if (
      !selectedFinancialAccount.linkedChartAccountCode
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Selected Payroll payment account is not linked to a Chart of Accounts code.",
      });
    }

            let scheduledPayDate =
      finalPayFrequency === "Monthly"
        ? getScheduledMonthlyPayDate(
            payPeriod
          )
        : normalizePayrollDate(
            payDate || payPeriod
          );

    let calculationDate =
      normalizePayrollDate(
        scheduledPayDate
      );

    /*
     * Resolve the employee's Active H2 compensation record.
     * The request gross pay and compensation type cannot
     * override controlled employee compensation.
     */
    let resolvedCompensation =
      await resolvePayrollCompensation({
        employeeId: finalEmployeeId,
        calculationDate,
        requestedGrossPay:
          enteredGrossPay,
        requestedPayFrequency:
          finalPayFrequency,
        requestedCompensationType:
          normalizedCompensationType,
      });

    const initiallyResolvedDate =
      formatDateForComparison(
        calculationDate
      );

    finalPayFrequency =
      resolvedCompensation.payFrequency;

    scheduledPayDate =
      finalPayFrequency === "Monthly"
        ? getScheduledMonthlyPayDate(
            payPeriod
          )
        : normalizePayrollDate(
            payDate || payPeriod
          );

    calculationDate =
      normalizePayrollDate(
        scheduledPayDate
      );

    /*
     * Resolve again if the controlled pay frequency changed
     * the final calculation date.
     */
    if (
      formatDateForComparison(
        calculationDate
      ) !== initiallyResolvedDate
    ) {
      resolvedCompensation =
        await resolvePayrollCompensation({
          employeeId:
            finalEmployeeId,
          calculationDate,
          requestedGrossPay:
            enteredGrossPay,
          requestedPayFrequency:
            finalPayFrequency,
          requestedCompensationType:
            normalizedCompensationType,
        });

      finalPayFrequency =
        resolvedCompensation.payFrequency;
    }

    enteredGrossPay =
      resolvedCompensation.grossPay;

    normalizedCompensationType =
      resolvedCompensation.compensationType;

    validateStatutorySelection({
      statutoryTreatment:
        normalizedStatutoryTreatment,
      compensationType:
        normalizedCompensationType,
      statutoryExemption,
      user: req.user,
    });

    const ytdNisContext =
      await getPriorYtdNisContext({
        employeeId:
          finalEmployeeId,
        payDate:
          calculationDate,
      });

    let payrollBreakdown;
    let finalTargetNetPay = 0;
    let employerSupportAllowance = 0;

    if (
      normalizedStatutoryTreatment ===
      "Employer-Assisted Net Pay"
    ) {
      const assistedResult =
        await calculateEmployerAssistedPayroll({
          baseGrossPay: enteredGrossPay,
          targetNetPay,
          pensionEmployee: Number(
            pensionEmployee || 0
          ),
          payPeriod,
          payDate: calculationDate,
          payFrequency:
            finalPayFrequency,
          priorYtdNisInsurablePay:
            ytdNisContext
              .priorYtdNisInsurablePay,
        });

      payrollBreakdown =
        assistedResult.calculation;
      finalTargetNetPay =
        assistedResult.targetNetPay;
      employerSupportAllowance =
        assistedResult.employerSupportAllowance;
    } else {
      payrollBreakdown =
        await calculateJamaicanPayroll({
          grossPay: enteredGrossPay,
          pensionEmployee: Number(
            pensionEmployee || 0
          ),
          payPeriod,
          payDate: calculationDate,
          payFrequency:
            finalPayFrequency,
          priorYtdNisInsurablePay:
            ytdNisContext
              .priorYtdNisInsurablePay,
        });
    }

    if (
      normalizedStatutoryTreatment ===
      "Documented Exemption"
    ) {
      payrollBreakdown =
        applyDocumentedExemption(
          payrollBreakdown
        );
    }

    if (payrollBreakdown.netPay < 0) {
      return res.status(400).json({
        success: false,
        message:
          "Payroll deductions cannot exceed gross pay",
      });
    }

    const applyEmployeeStatutoryDeductions =
      normalizedStatutoryTreatment !==
      "Documented Exemption";

    const applyEmployerStatutoryContributions =
      normalizedStatutoryTreatment !==
      "Documented Exemption";

    const minimumWageAssessment =
      buildMinimumWageAssessment({
        payDate: calculationDate,
        workedHours,
        grossPay: payrollBreakdown.grossPay,
        applicable: true,
      });

    const shouldApplyAdvances = normalizeBoolean(
      applyEmployeeAdvances,
      true
    );

    const netPayBeforeAdvance =
      payrollBreakdown.netPay;

    const recoveryPlan = shouldApplyAdvances
      ? await buildEmployeeAdvanceRecoveryPlan({
          employeeId: finalEmployeeId,
          payPeriod,
          availableNetPay:
            netPayBeforeAdvance,
          requestedRecoveryAmount:
            requestedAdvanceRecovery,
        })
      : {
          totalAdvanceRecovery: 0,
          allocations: [],
        };

    payrollBreakdown.netPayBeforeAdvance =
      netPayBeforeAdvance;

    payrollBreakdown.advanceRecovery =
      recoveryPlan.totalAdvanceRecovery;

    payrollBreakdown.advanceRecoveries =
      recoveryPlan.allocations;

    payrollBreakdown.netPay = roundMoney(
      netPayBeforeAdvance -
        recoveryPlan.totalAdvanceRecovery
    );

    const exemptionRecord =
      normalizedStatutoryTreatment ===
      "Documented Exemption"
        ? {
            reason: String(
              statutoryExemption.reason || ""
            ).trim(),
            legalBasis: String(
              statutoryExemption.legalBasis || ""
            ).trim(),
            supportingReference: String(
              statutoryExemption.supportingReference ||
                ""
            ).trim(),
            supportingDocumentUrl: String(
              statutoryExemption.supportingDocumentUrl ||
                ""
            ).trim(),
            effectiveFrom:
              statutoryExemption.effectiveFrom ||
              null,
            effectiveTo:
              statutoryExemption.effectiveTo ||
              null,
            authorizedBy: getUserName(req.user),
            authorizedAt: new Date(),
          }
        : undefined;

    const newPayroll = await Payroll.create({
      payrollNumber: `PAY-${Date.now()}`,
      employeeId: finalEmployeeId,
      employeeName: finalEmployeeName,
      role: finalRole,
      payPeriod,
      payDate: calculationDate,
      payFrequency: finalPayFrequency,

            compensationType:
        normalizedCompensationType,

      compensationSource:
        resolvedCompensation
          .compensationSource,

      compensationRecordId:
        resolvedCompensation
          .compensationSnapshot
          .compensationRecordId,

      compensationNumber:
        resolvedCompensation
          .compensationSnapshot
          .compensationNumber,

      compensationCategory:
        resolvedCompensation
          .compensationSnapshot
          .compensationCategory,

      compensationComponentCode:
        resolvedCompensation
          .compensationSnapshot
          .compensationComponentCode,

      compensationComponentName:
        resolvedCompensation
          .compensationSnapshot
          .compensationComponentName,

      compensationAmount:
        resolvedCompensation
          .compensationSnapshot
          .compensationAmount,

      compensationCurrency:
        resolvedCompensation
          .compensationSnapshot
          .compensationCurrency,

      compensationRateUnit:
        resolvedCompensation
          .compensationSnapshot
          .compensationRateUnit,

      compensationEffectiveFrom:
        resolvedCompensation
          .compensationSnapshot
          .compensationEffectiveFrom,

      compensationEffectiveTo:
        resolvedCompensation
          .compensationSnapshot
          .compensationEffectiveTo,

      compensationResolvedAsOf:
        resolvedCompensation
          .compensationSnapshot
          .compensationResolvedAsOf,

      statutoryTreatment:
        normalizedStatutoryTreatment,

      applyEmployeeStatutoryDeductions,

      applyEmployerStatutoryContributions,

      targetNetPay: finalTargetNetPay,

      employerSupportAllowance,

      statutoryExemption: exemptionRecord,

      minimumWageAssessment,

      grossPay: payrollBreakdown.grossPay,

      statutoryIncome:
        payrollBreakdown.statutoryIncome,

      chargeableIncome:
        payrollBreakdown.chargeableIncome,

      nisInsurablePay:
        payrollBreakdown.nisInsurablePay,

      deductions:
        payrollBreakdown.totalDeductions,

      nisEmployee:
        payrollBreakdown.nisEmployee,

      nhtEmployee:
        payrollBreakdown.nhtEmployee,

      educationTax:
        payrollBreakdown.educationTax,

      incomeTax:
        payrollBreakdown.incomeTax,

      pensionEmployee:
        payrollBreakdown.pensionEmployee,

      totalDeductions:
        payrollBreakdown.totalDeductions,

      netPayBeforeAdvance:
        payrollBreakdown.netPayBeforeAdvance,

      advanceRecovery:
        payrollBreakdown.advanceRecovery,

      advanceRecoveries:
        payrollBreakdown.advanceRecoveries,

      netPay: payrollBreakdown.netPay,

      nisEmployer:
        payrollBreakdown.nisEmployer,

      nhtEmployer:
        payrollBreakdown.nhtEmployer,

      educationTaxEmployer:
        payrollBreakdown.educationTaxEmployer,

      heartEmployer:
        payrollBreakdown.heartEmployer,

      totalEmployerContributions:
        payrollBreakdown.totalEmployerContributions,

      totalPayrollCost:
        payrollBreakdown.totalPayrollCost,

      statutoryRuleId:
        payrollBreakdown.statutoryRuleId,

      statutoryRuleCode:
        payrollBreakdown.statutoryRuleCode,

      statutoryRuleEffectiveFrom:
        payrollBreakdown.statutoryRuleEffectiveFrom,

      statutoryRuleSnapshot:
        payrollBreakdown.statutoryRuleSnapshot,

      calculationMode: "Automatic",

      paidFromAccountNumber,

      paidFromAccountName:
        selectedFinancialAccount.accountName,

      status: "Pending",

      createdBy: getUserName(req.user),
    });

    try {
      if (req.user) {
        await writeAuditLog({
          req,
          action: "CREATE_PAYROLL_PENDING",
          module: "Payroll",
          description:
            `Pending Payroll ${newPayroll.payrollNumber} created ` +
            `for ${newPayroll.employeeName}`,
          targetType: "Payroll",
          targetId: newPayroll.payrollNumber,
          metadata: {
            employeeId: newPayroll.employeeId,
            employeeName:
              newPayroll.employeeName,
            payPeriod: newPayroll.payPeriod,
                        compensationType:
              newPayroll.compensationType,
            compensationSource:
              newPayroll.compensationSource,
            compensationNumber:
              newPayroll.compensationNumber,
            compensationAmount:
              newPayroll.compensationAmount,
            compensationEffectiveFrom:
              newPayroll.compensationEffectiveFrom,
            statutoryTreatment:
              newPayroll.statutoryTreatment,
            applyEmployeeStatutoryDeductions:
              newPayroll.applyEmployeeStatutoryDeductions,
            applyEmployerStatutoryContributions:
              newPayroll.applyEmployerStatutoryContributions,
            enteredGrossPay,
            grossPay: newPayroll.grossPay,
            targetNetPay:
              newPayroll.targetNetPay,
            employerSupportAllowance:
              newPayroll.employerSupportAllowance,
            totalEmployeeDeductions:
              newPayroll.totalDeductions,
            netPayBeforeAdvance:
              newPayroll.netPayBeforeAdvance,
            advanceRecovery:
              newPayroll.advanceRecovery,
            netPay: newPayroll.netPay,
            totalEmployerContributions:
              newPayroll.totalEmployerContributions,
            totalPayrollCost:
              newPayroll.totalPayrollCost,
            statutoryRuleCode:
              newPayroll.statutoryRuleCode,
            minimumWageAssessment:
              newPayroll.minimumWageAssessment,
            statutoryExemption:
              newPayroll.statutoryTreatment ===
              "Documented Exemption"
                ? newPayroll.statutoryExemption
                : undefined,
            paidFromAccountNumber:
              newPayroll.paidFromAccountNumber,
            paidFromAccountName:
              newPayroll.paidFromAccountName,
            status: newPayroll.status,
          },
        });
      }
    } catch (auditError) {
      console.error(
        "Audit log error while creating pending Payroll:",
        auditError
      );
    }

    return res.status(201).json({
      success: true,
      message:
        "Payroll record created successfully and is pending approval",
      data: newPayroll,
    });
  } catch (error) {
    console.error(
      "Error creating Payroll:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Failed to create Payroll record",
    });
  }
};

const executePayrollController = async ({
  controller,
  req,
  body,
}) => {
  return new Promise((resolve) => {
    let statusCode = 200;

    const internalResponse = {
      status(code) {
        statusCode = code;
        return internalResponse;
      },

      json(payload) {
        resolve({
          statusCode,
          payload,
        });

        return internalResponse;
      },
    };

    const internalRequest = {
      ...req,
      body,
      params: {},
      query: {},
    };

    Promise.resolve(
      controller(
        internalRequest,
        internalResponse
      )
    ).catch((error) => {
      resolve({
        statusCode: 500,
        payload: {
          success: false,
          message:
            error.message ||
            "Internal Payroll processing failed",
        },
      });
    });
  });
};

const validateBatchRequest = ({
  records,
  maximumRecords = 100,
}) => {
  if (
    !Array.isArray(records) ||
    records.length === 0
  ) {
    throw new Error(
      "Batch Payroll requires at least one employee record."
    );
  }

  if (records.length > maximumRecords) {
    throw new Error(
      `A maximum of ${maximumRecords} employees can be processed in one Payroll batch.`
    );
  }

  const duplicateEmployeeIds = [];

  const employeeIds = records
    .map((record) =>
      String(
        record?.employeeId || ""
      ).trim()
    )
    .filter(Boolean);

  const employeeIdCounts =
    employeeIds.reduce(
      (counts, employeeId) => ({
        ...counts,
        [employeeId]:
          Number(counts[employeeId] || 0) +
          1,
      }),
      {}
    );

  Object.entries(employeeIdCounts).forEach(
    ([employeeId, count]) => {
      if (count > 1) {
        duplicateEmployeeIds.push(
          employeeId
        );
      }
    }
  );

  if (duplicateEmployeeIds.length) {
    throw new Error(
      "The following employees appear more than once in the batch: " +
        duplicateEmployeeIds.join(", ")
    );
  }
};

const buildBatchRecordBody = ({
  defaults,
  record,
}) => ({
  ...(defaults || {}),
  ...(record || {}),
  employeeId: String(
    record?.employeeId || ""
  ).trim(),
});

const previewPayrollBatch = async (
  req,
  res
) => {
  try {
    const {
      records = [],
      defaults = {},
    } = req.body;

    validateBatchRequest({
      records,
    });

    const results = [];

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];

      const body = buildBatchRecordBody({
        defaults,
        record,
      });

      const existingPayroll =
  body.employeeId &&
  body.payPeriod
    ? await Payroll.findOne({
        employeeId:
          body.employeeId,
        payPeriod:
          body.payPeriod,
        status: {
          $nin: [
            "Reversed",
            "Cancelled",
          ],
        },
      })
        .select(
          "payrollNumber employeeName status payPeriod"
        )
        .lean()
    : null;

if (existingPayroll) {
  results.push({
    rowNumber: index + 1,
    employeeId:
      body.employeeId,
    employeeName:
      existingPayroll.employeeName ||
      String(
        record?.employeeName || ""
      ).trim(),
    success: false,
    statusCode: 409,
    message:
      `${existingPayroll.employeeName} already has Payroll ` +
      `${existingPayroll.payrollNumber} for ${existingPayroll.payPeriod} ` +
      `with status ${existingPayroll.status}.`,
    data: {
      existingPayrollNumber:
        existingPayroll.payrollNumber,
      existingStatus:
        existingPayroll.status,
      payPeriod:
        existingPayroll.payPeriod,
    },
  });

  continue;
}

      const result =
        await executePayrollController({
          controller: previewPayroll,
          req,
          body,
        });

      results.push({
        rowNumber: index + 1,
        employeeId:
          body.employeeId || "",
        employeeName:
          String(
            record?.employeeName || ""
          ).trim(),
        success:
          result.statusCode >= 200 &&
          result.statusCode < 300 &&
          result.payload?.success !== false,
        statusCode: result.statusCode,
        message:
          result.payload?.message || "",
        data:
          result.payload?.data || null,
      });
    }

    const successfulRecords =
      results.filter(
        (result) => result.success
      );

    const failedRecords =
      results.filter(
        (result) => !result.success
      );

    const totals =
      successfulRecords.reduce(
        (summary, result) => {
          const payroll =
            result.data || {};

          summary.grossPay =
            roundMoney(
              summary.grossPay +
                Number(
                  payroll.grossPay || 0
                )
            );

          summary.totalEmployeeDeductions =
            roundMoney(
              summary.totalEmployeeDeductions +
                Number(
                  payroll.totalDeductions ??
                    payroll.totalEmployeeDeductions ??
                    0
                )
            );

          summary.netPayBeforeAdvance =
            roundMoney(
              summary.netPayBeforeAdvance +
                Number(
                  payroll.netPayBeforeAdvance ||
                    0
                )
            );

          summary.advanceRecovery =
            roundMoney(
              summary.advanceRecovery +
                Number(
                  payroll.advanceRecovery ||
                    0
                )
            );

          summary.netPay =
            roundMoney(
              summary.netPay +
                Number(
                  payroll.netPay || 0
                )
            );

          summary.totalEmployerContributions =
            roundMoney(
              summary.totalEmployerContributions +
                Number(
                  payroll.totalEmployerContributions ||
                    0
                )
            );

          summary.totalPayrollCost =
            roundMoney(
              summary.totalPayrollCost +
                Number(
                  payroll.totalPayrollCost ||
                    0
                )
            );

          summary.governmentObligations.nis =
            roundMoney(
              summary.governmentObligations.nis +
                Number(
                  payroll.nisEmployee || 0
                ) +
                Number(
                  payroll.nisEmployer || 0
                )
            );

          summary.governmentObligations.nht =
            roundMoney(
              summary.governmentObligations.nht +
                Number(
                  payroll.nhtEmployee || 0
                ) +
                Number(
                  payroll.nhtEmployer || 0
                )
            );

          summary.governmentObligations.educationTax =
            roundMoney(
              summary.governmentObligations.educationTax +
                Number(
                  payroll.educationTax || 0
                ) +
                Number(
                  payroll.educationTaxEmployer ||
                    0
                )
            );

          summary.governmentObligations.paye =
            roundMoney(
              summary.governmentObligations.paye +
                Number(
                  payroll.incomeTax || 0
                )
            );

          summary.governmentObligations.heart =
            roundMoney(
              summary.governmentObligations.heart +
                Number(
                  payroll.heartEmployer || 0
                )
            );

          summary.governmentObligations.pension =
            roundMoney(
              summary.governmentObligations.pension +
                Number(
                  payroll.pensionEmployee ||
                    0
                )
            );

          return summary;
        },
        {
          grossPay: 0,
          totalEmployeeDeductions: 0,
          netPayBeforeAdvance: 0,
          advanceRecovery: 0,
          netPay: 0,
          totalEmployerContributions: 0,
          totalPayrollCost: 0,
          governmentObligations: {
            nis: 0,
            nht: 0,
            educationTax: 0,
            paye: 0,
            heart: 0,
            pension: 0,
            total: 0,
          },
        }
      );

    totals.governmentObligations.total =
      roundMoney(
        totals.governmentObligations.nis +
          totals.governmentObligations.nht +
          totals.governmentObligations
            .educationTax +
          totals.governmentObligations.paye +
          totals.governmentObligations.heart +
          totals.governmentObligations.pension
      );

    return res.json({
      success:
        failedRecords.length === 0,
      message:
        failedRecords.length === 0
          ? "Payroll batch preview calculated successfully"
          : "Payroll batch preview completed with validation failures",
      summary: {
        requestedRecords:
          records.length,
        successfulRecords:
          successfulRecords.length,
        failedRecords:
          failedRecords.length,
        totals,
      },
      data: results,
    });
  } catch (error) {
    console.error(
      "Error previewing Payroll batch:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Could not preview Payroll batch",
    });
  }
};

const createPayrollBatch = async (
  req,
  res
) => {
  try {
    const {
      records = [],
      defaults = {},
    } = req.body;

    validateBatchRequest({
      records,
    });

    const results = [];

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];

      const body = buildBatchRecordBody({
        defaults,
        record,
      });

      const result =
        await executePayrollController({
          controller: createPayroll,
          req,
          body,
        });

      const succeeded =
        result.statusCode >= 200 &&
        result.statusCode < 300 &&
        result.payload?.success !== false;

      results.push({
        rowNumber: index + 1,
        employeeId:
          body.employeeId || "",
        employeeName:
          result.payload?.data
            ?.employeeName ||
          String(
            record?.employeeName || ""
          ).trim(),
        payrollNumber:
          result.payload?.data
            ?.payrollNumber || "",
        success: succeeded,
        statusCode:
          result.statusCode,
        message:
          result.payload?.message || "",
        data:
          result.payload?.data || null,
      });
    }

    const successfulRecords =
      results.filter(
        (result) => result.success
      );

    const failedRecords =
      results.filter(
        (result) => !result.success
      );

    try {
      if (req.user) {
        await writeAuditLog({
          req,
          action:
            "CREATE_PAYROLL_BATCH",
          module: "Payroll",
          description:
            `Payroll batch completed: ` +
            `${successfulRecords.length} created, ` +
            `${failedRecords.length} failed`,
          targetType:
            "Payroll Batch",
          targetId:
            `PAY-BATCH-${Date.now()}`,
          metadata: {
            requestedRecords:
              records.length,
            successfulRecords:
              successfulRecords.length,
            failedRecords:
              failedRecords.length,
            payPeriod:
              defaults?.payPeriod || "",
            paidFromAccountNumber:
              defaults
                ?.paidFromAccountNumber ||
              "",
            createdPayrollNumbers:
              successfulRecords
                .map(
                  (result) =>
                    result.payrollNumber
                )
                .filter(Boolean),
            failures:
              failedRecords.map(
                (result) => ({
                  employeeId:
                    result.employeeId,
                  message:
                    result.message,
                  statusCode:
                    result.statusCode,
                })
              ),
          },
        });
      }
    } catch (auditError) {
      console.error(
        "Audit log error while recording Payroll batch:",
        auditError
      );
    }

    const responseStatus =
      successfulRecords.length ===
      records.length
        ? 201
        : successfulRecords.length > 0
        ? 207
        : 400;

    return res.status(
      responseStatus
    ).json({
      success:
        failedRecords.length === 0,
      partialSuccess:
        successfulRecords.length > 0 &&
        failedRecords.length > 0,
      message:
        failedRecords.length === 0
          ? `${successfulRecords.length} Payroll records created successfully and are pending approval`
          : successfulRecords.length > 0
          ? `${successfulRecords.length} Payroll records created and ${failedRecords.length} failed`
          : "No Payroll records were created",
      summary: {
        requestedRecords:
          records.length,
        successfulRecords:
          successfulRecords.length,
        failedRecords:
          failedRecords.length,
      },
      data: results,
    });
  } catch (error) {
    console.error(
      "Error creating Payroll batch:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Could not create Payroll batch",
    });
  }
};

const approvePayroll = async (req, res) => {
  try {
    const { payrollNumber } = req.params;
    const { approvalNotes = "" } = req.body;

    const payroll = await Payroll.findOne({ payrollNumber });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    if (payroll.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message:
          `Only Pending Payroll can be approved. ` +
          `Current status: ${payroll.status}`,
      });
    }

    payroll.status = "Approved";
    payroll.approvedBy = getUserName(req.user);
    payroll.approvedAt = new Date();
    payroll.approvalNotes = String(approvalNotes || "").trim();

    await payroll.save();

    try {
      await writeAuditLog({
        req,
        action: "APPROVE_PAYROLL",
        module: "Payroll",
        description:
          `Payroll ${payroll.payrollNumber} approved ` +
          `for ${payroll.employeeName}`,
        targetType: "Payroll",
        targetId: payroll.payrollNumber,
        metadata: {
          employeeId: payroll.employeeId,
          employeeName: payroll.employeeName,
          payPeriod: payroll.payPeriod,
          grossPay: payroll.grossPay,
          netPay: payroll.netPay,
          advanceRecovery: payroll.advanceRecovery,
          approvedBy: payroll.approvedBy,
          approvedAt: payroll.approvedAt,
        },
      });
    } catch (auditError) {
      console.error("Payroll approval audit error:", auditError);
    }

    return res.json({
      success: true,
      message: "Payroll approved successfully",
      data: payroll,
    });
  } catch (error) {
    console.error("Error approving Payroll:", error);

    return res.status(500).json({
      success: false,
      message: "Could not approve Payroll",
      error: error.message,
    });
  }
};

const payPayroll = async (req, res) => {
  try {
    const { payrollNumber } = req.params;

    const payroll = await Payroll.findOne({ payrollNumber });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    if (payroll.status !== "Approved") {
      return res.status(400).json({
        success: false,
        message:
          `Only Approved Payroll can be paid. ` +
          `Current status: ${payroll.status}`,
      });
    }

    if (payroll.journalEntryNumber) {
      return res.status(409).json({
        success: false,
        message:
          `Payroll ${payroll.payrollNumber} has already been posted`,
      });
    }

        const scheduledPayDate = formatDateForComparison(
      payroll.payDate
    );

        const jamaicaToday = getJamaicaToday();

    if (
      scheduledPayDate &&
      jamaicaToday < scheduledPayDate
    ) {
      return res.status(400).json({
        success: false,
        message:
          `Payroll ${payroll.payrollNumber} is scheduled for ` +
          `${scheduledPayDate}. Pay & Post is unavailable before ` +
          `the scheduled payment date in Jamaica.`,
        scheduledPayDate,
        currentDate: jamaicaToday,
      });
    }

    const paymentAccount = await FinancialAccount.findOne({
      accountNumber: payroll.paidFromAccountNumber,
      status: "Active",
      accountType: {
        $in: ["Bank", "Cash"],
      },
    });

    if (!paymentAccount) {
      return res.status(404).json({
        success: false,
        message:
          "The selected Payroll payment account is unavailable",
      });
    }

    if (!paymentAccount.linkedChartAccountCode) {
      return res.status(400).json({
        success: false,
        message:
          "The Payroll payment account is not linked to the Chart of Accounts",
      });
    }

    if (
      Number(paymentAccount.currentBalance || 0) <
      Number(payroll.netPay || 0)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Insufficient balance in the Payroll payment account",
      });
    }

    const recoveryPlan =
      await buildEmployeeAdvanceRecoveryPlan({
        employeeId: payroll.employeeId,
        payPeriod: payroll.payPeriod,
        availableNetPay: payroll.netPayBeforeAdvance,
        requestedRecoveryAmount: payroll.advanceRecovery,
      });

    if (
      roundMoney(recoveryPlan.totalAdvanceRecovery) !==
      roundMoney(payroll.advanceRecovery)
    ) {
      return res.status(409).json({
        success: false,
        message:
          "The employee advance balance changed after this Payroll " +
          "was created. Cancel and recreate the Payroll.",
      });
    }

    const expectedAdvanceNumbers = (
      payroll.advanceRecoveries || []
    )
      .map((item) => item.advanceNumber)
      .sort()
      .join(",");

    const currentAdvanceNumbers = (
      recoveryPlan.allocations || []
    )
      .map((item) => item.advanceNumber)
      .sort()
      .join(",");

    if (expectedAdvanceNumbers !== currentAdvanceNumbers) {
      return res.status(409).json({
        success: false,
        message:
          "The employee advance allocation changed after approval. " +
          "Cancel and recreate the Payroll.",
      });
    }

    const journalEntry = await postPayrollPayment({
      paymentAccount,
      payroll,
      paymentDate: payroll.payDate,
      user: req.user,
    });

    const appliedAdvanceRecoveries =
      await applyEmployeeAdvanceRecoveries({
        allocations: recoveryPlan.allocations,
        payrollNumber: payroll.payrollNumber,
        payPeriod: payroll.payPeriod,
        journalEntryNumber: journalEntry.entryNumber,
        recoveredBy: getUserName(req.user),
      });

    const transaction = await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}-PAY`,
      accountNumber: paymentAccount.accountNumber,
      accountName: paymentAccount.accountName,
      linkedChartAccountCode:
        paymentAccount.linkedChartAccountCode,
      journalEntryNumber: journalEntry.entryNumber,
      ledgerReference: journalEntry.entryNumber,
      transactionType: "Payroll Payment",
      amount: Number(payroll.netPay || 0),
      reference: payroll.payrollNumber,
      notes:
        `Payroll payment for ${payroll.employeeName} - ` +
        `${payroll.payPeriod}`,
      transactionDate: payroll.payDate || new Date(),
    });

    payroll.status = "Paid";
    payroll.journalEntryNumber = journalEntry.entryNumber;
    payroll.paidBy = getUserName(req.user);
    payroll.paidAt = new Date();

    await payroll.save();

    try {
      await writeAuditLog({
        req,
        action: "PAY_PAYROLL",
        module: "Payroll",
        description:
          `Payroll ${payroll.payrollNumber} paid ` +
          `for ${payroll.employeeName}`,
        targetType: "Payroll",
        targetId: payroll.payrollNumber,
        journalEntryNumber: journalEntry.entryNumber,
        accountNumber: paymentAccount.accountNumber,
        accountName: paymentAccount.accountName,
        metadata: {
          employeeId: payroll.employeeId,
          employeeName: payroll.employeeName,
          payPeriod: payroll.payPeriod,
          grossPay: payroll.grossPay,
          totalEmployeeDeductions:
            payroll.totalDeductions,
          netPayBeforeAdvance:
            payroll.netPayBeforeAdvance,
          advanceRecovery: payroll.advanceRecovery,
          advanceRecoveries: appliedAdvanceRecoveries,
          netPay: payroll.netPay,
          totalEmployerContributions:
            payroll.totalEmployerContributions,
          totalPayrollCost: payroll.totalPayrollCost,
          paidBy: payroll.paidBy,
          paidAt: payroll.paidAt,
          transactionNumber: transaction.transactionNumber,
        },
      });
    } catch (auditError) {
      console.error("Payroll payment audit error:", auditError);
    }

    return res.json({
      success: true,
      message: "Payroll paid and posted successfully",
      data: payroll,
      journalEntryNumber: journalEntry.entryNumber,
      transactionNumber: transaction.transactionNumber,
      advanceRecoveries: appliedAdvanceRecoveries,
    });
  } catch (error) {
    console.error("Error paying Payroll:", error);

    return res.status(500).json({
      success: false,
      message: "Could not pay Payroll",
      error: error.message,
    });
  }
};

const cancelPayroll = async (req, res) => {
  try {
    const { payrollNumber } = req.params;
    const { reason = "" } = req.body;

    if (!String(reason || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required",
      });
    }

    const payroll = await Payroll.findOne({ payrollNumber });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    if (!["Pending", "Approved"].includes(payroll.status)) {
      return res.status(400).json({
        success: false,
        message:
          "Only Pending or Approved Payroll can be cancelled",
      });
    }

    payroll.status = "Cancelled";
    payroll.cancelledBy = getUserName(req.user);
    payroll.cancelledAt = new Date();
    payroll.cancellationReason = String(reason).trim();

    await payroll.save();

    try {
      await writeAuditLog({
        req,
        action: "CANCEL_PAYROLL",
        module: "Payroll",
        description:
          `Payroll ${payroll.payrollNumber} cancelled`,
        targetType: "Payroll",
        targetId: payroll.payrollNumber,
        metadata: {
          employeeId: payroll.employeeId,
          employeeName: payroll.employeeName,
          payPeriod: payroll.payPeriod,
          cancelledBy: payroll.cancelledBy,
          cancelledAt: payroll.cancelledAt,
          reason: payroll.cancellationReason,
        },
      });
    } catch (auditError) {
      console.error("Payroll cancellation audit error:", auditError);
    }

    return res.json({
      success: true,
      message: "Payroll cancelled successfully",
      data: payroll,
    });
  } catch (error) {
    console.error("Error cancelling Payroll:", error);

    return res.status(500).json({
      success: false,
      message: "Could not cancel Payroll",
      error: error.message,
    });
  }
};

module.exports = {
  getPayroll,
  getMyPayroll,
  getPayrollRegister,
  getEmployeePayrollYtd,
  reassessPayrollCompliance,
  previewPayroll,
  previewPayrollBatch,
  createPayroll,
  createPayrollBatch,
  approvePayroll,
  payPayroll,
  cancelPayroll,
};