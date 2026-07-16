const Payroll = require("../models/Payroll");
const HREmployee = require("../models/HREmployee");
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
  const normalizedDate = normalizePayrollDate(payDate);
  const date = new Date(`${normalizedDate}T00:00:00.000Z`);

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
  const rule = getMinimumWageRule(payDate);
  const safeWorkedHours = Math.max(0, Number(workedHours || 0));
  const assessedGrossPay = roundMoney(grossPay);
  const minimumGrossPay =
    applicable && rule.hourlyRate > 0 && safeWorkedHours > 0
      ? roundMoney(safeWorkedHours * rule.hourlyRate)
      : 0;

  const shortfall = Math.max(
    0,
    roundMoney(minimumGrossPay - assessedGrossPay)
  );

  const compliant = shortfall === 0;

  let warning = "";

  if (applicable && safeWorkedHours <= 0) {
    warning =
      "Minimum-wage compliance could not be assessed because worked hours were not supplied.";
  } else if (!compliant) {
    warning =
      `Entered gross pay is JMD ${shortfall.toFixed(2)} below the ` +
      `minimum ordinary-time pay calculated from ${safeWorkedHours.toFixed(
        2
      )} hours at JMD ${rule.hourlyRate.toFixed(2)} per hour.`;
  }

  return {
    applicable,
    hourlyRate: rule.hourlyRate,
    workedHours: roundMoney(safeWorkedHours),
    minimumGrossPay,
    assessedGrossPay,
    shortfall,
    compliant,
    warning,
    ruleCode: rule.ruleCode,
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
}) => {
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
    await calculateJamaicanPayroll({
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
      await calculateJamaicanPayroll({
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
      await calculateJamaicanPayroll({
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
    await calculateJamaicanPayroll({
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
      await calculateJamaicanPayroll({
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

    if (Number(grossPay || 0) <= 0 || !payPeriod) {
      return res.status(400).json({
        success: false,
        message: "Pay period and valid gross pay are required",
      });
    }

    const normalizedCompensationType =
      COMPENSATION_TYPES.includes(compensationType)
        ? compensationType
        : "Salary";

    const normalizedStatutoryTreatment =
      STATUTORY_TREATMENTS.includes(statutoryTreatment)
        ? statutoryTreatment
        : "Standard";

    validateStatutorySelection({
      statutoryTreatment: normalizedStatutoryTreatment,
      compensationType: normalizedCompensationType,
      statutoryExemption,
      user: req.user,
    });

        const scheduledPayDate =
      payFrequency === "Monthly"
        ? getScheduledMonthlyPayDate(payPeriod)
        : normalizePayrollDate(
            payDate || payPeriod
          );

    const calculationDate =
      normalizePayrollDate(scheduledPayDate);

    let calculation;
    let finalTargetNetPay = 0;
    let employerSupportAllowance = 0;

    if (
      normalizedStatutoryTreatment ===
      "Employer-Assisted Net Pay"
    ) {
      const assistedResult =
        await calculateEmployerAssistedPayroll({
          baseGrossPay: grossPay,
          targetNetPay,
          pensionEmployee: Number(pensionEmployee || 0),
          payPeriod,
          payDate: calculationDate,
          payFrequency,
        });

      calculation = assistedResult.calculation;
      finalTargetNetPay = assistedResult.targetNetPay;
      employerSupportAllowance =
        assistedResult.employerSupportAllowance;
    } else {
      calculation = await calculateJamaicanPayroll({
        grossPay,
        pensionEmployee,
        payPeriod,
        payDate: calculationDate,
        payFrequency,
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
        scheduledPayDate,
        payDate: scheduledPayDate,
        compensationType:
          normalizedCompensationType,
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
      Number(grossPay || 0) <= 0 ||
      !paidFromAccountNumber
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Pay period, valid gross pay, and payment account are required",
      });
    }

    const normalizedCompensationType =
      COMPENSATION_TYPES.includes(compensationType)
        ? compensationType
        : "Salary";

    const normalizedStatutoryTreatment =
      STATUTORY_TREATMENTS.includes(statutoryTreatment)
        ? statutoryTreatment
        : "Standard";

    validateStatutorySelection({
      statutoryTreatment:
        normalizedStatutoryTreatment,
      compensationType:
        normalizedCompensationType,
      statutoryExemption,
      user: req.user,
    });

    let finalEmployeeId = "";
    let finalEmployeeName = String(
      employeeName || ""
    ).trim();
    let finalRole = String(role || "").trim();
    let finalPayFrequency =
      payFrequency || "Monthly";

    const enteredGrossPay = roundMoney(grossPay);

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

        const scheduledPayDate =
      finalPayFrequency === "Monthly"
        ? getScheduledMonthlyPayDate(payPeriod)
        : normalizePayrollDate(
            payDate || payPeriod
          );

    const calculationDate =
      normalizePayrollDate(scheduledPayDate);

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
          payFrequency: finalPayFrequency,
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
          payFrequency: finalPayFrequency,
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
  previewPayroll,
  createPayroll,
  approvePayroll,
  payPayroll,
  cancelPayroll,
};