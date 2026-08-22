const HREmployee = require("../models/HREmployee");
const EmployeeCompensation = require("../models/EmployeeCompensation");
const AttendancePeriod = require("../models/AttendancePeriod");
const Payroll = require("../models/Payroll");
const PayrollStatutoryRule = require("../models/PayrollStatutoryRule");
const MinimumWageRule = require("../models/MinimumWageRule");
const { writeAuditLog } = require("../utils/auditLogger");

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalize = (value) => String(value || "").trim();

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getJamaicaTodayYmd = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
};

const isValidYmd = (value) => {
  const text = normalize(value);
  if (!YMD_PATTERN.test(text)) return false;

  const date = new Date(`${text}T12:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === text
  );
};

const toEndOfDay = (ymd) =>
  new Date(`${ymd}T23:59:59.999Z`);

const toStartOfDay = (ymd) =>
  new Date(`${ymd}T00:00:00.000Z`);

const mapLatestByEmployee = (records = []) => {
  const result = new Map();

  for (const record of records) {
    if (!result.has(record.employeeId)) {
      result.set(record.employeeId, record);
    }
  }

  return result;
};

const resolveComplianceStatus = (payroll) => {
  const assessment = payroll?.minimumWageAssessment || {};

  if (assessment.applicable === false) return "Not Applicable";

  if (
    assessment.compliant === true &&
    assessment.assessmentStatus === "Compliant" &&
    Number(assessment.shortfall || 0) <= 0
  ) {
    return "Compliant";
  }

  if (
    assessment.compliant === false ||
    Number(assessment.shortfall || 0) > 0 ||
    assessment.assessmentStatus === "Non-Compliant"
  ) {
    return "Non-Compliant";
  }

  if (
    assessment.assessmentStatus === "Review Required" ||
    assessment.warning
  ) {
    return "Review Required";
  }

  return "Not Assessed";
};

const buildEligibility = ({
  employee,
  compensation,
  attendancePeriod,
  latestPayroll,
}) => {
  const blockers = [];

  if (employee.employmentStatus !== "Active") {
    blockers.push(`Employment status is ${employee.employmentStatus || "not specified"}.`);
  }

  if (employee.payrollEnabled !== true) {
    blockers.push("Payroll is disabled on the employee master record.");
  }

  if (employee.payrollEligibilityStatus !== "Eligible") {
    blockers.push(
      `Payroll eligibility is ${employee.payrollEligibilityStatus || "not specified"}.`
    );
  }

  if (!compensation) {
    blockers.push("No active effective-dated Base Pay compensation exists.");
  }

  if (
    employee.attendanceRequired !== false &&
    attendancePeriod?.status !== "Payroll Ready" &&
    attendancePeriod?.status !== "Locked"
  ) {
    blockers.push("Attendance is not Payroll Ready.");
  }

  const pendingAdjustments = (attendancePeriod?.adjustments || []).filter(
    (adjustment) => adjustment.status === "Pending"
  ).length;

  if (pendingAdjustments > 0) {
    blockers.push(`${pendingAdjustments} attendance adjustment(s) remain pending.`);
  }

  if (Number(attendancePeriod?.totals?.leavePayrollReviewDayCount || 0) > 0) {
    blockers.push("Attendance contains leave days requiring payroll review.");
  }

  const complianceStatus = latestPayroll
    ? resolveComplianceStatus(latestPayroll)
    : "Not Assessed";

  return {
    status: blockers.length === 0 ? "Eligible" : "Blocked",
    blockers,
    complianceStatus,
    pendingAdjustments,
  };
};

const getPayrollEligibilityComplianceReport = async (req, res) => {
  try {
    const asOfDate = normalize(req.query.asOfDate) || getJamaicaTodayYmd();
    const payPeriod = normalize(req.query.payPeriod) || asOfDate.slice(0, 7);

    if (!isValidYmd(asOfDate)) {
      return res.status(400).json({
        success: false,
        message: "Payroll compliance as-of date must use YYYY-MM-DD.",
      });
    }

    if (!/^\d{4}-\d{2}$/.test(payPeriod)) {
      return res.status(400).json({
        success: false,
        message: "Payroll reporting period must use YYYY-MM.",
      });
    }

    const employeeFilter = {};

    if (req.query.employeeId) employeeFilter.employeeId = normalize(req.query.employeeId);
    if (req.query.department) employeeFilter.department = normalize(req.query.department);
    if (req.query.branch) employeeFilter.branch = normalize(req.query.branch);
    if (req.query.employmentStatus) {
      employeeFilter.employmentStatus = normalize(req.query.employmentStatus);
    }
    if (req.query.eligibilityStatus) {
      employeeFilter.payrollEligibilityStatus = normalize(
        req.query.eligibilityStatus
      );
    }

    const employees = await HREmployee.find(employeeFilter)
      .sort({ fullName: 1, employeeId: 1 })
      .lean();

    const employeeIds = employees.map((employee) => employee.employeeId);

    const [compensations, attendancePeriods, payrollRecords, statutoryRules, wageRules] =
      await Promise.all([
        EmployeeCompensation.find({
          employeeId: { $in: employeeIds },
          compensationCategory: "Base Pay",
          status: "Active",
          effectiveFrom: { $lte: asOfDate },
          $or: [
            { effectiveTo: "" },
            { effectiveTo: null },
            { effectiveTo: { $gte: asOfDate } },
          ],
        })
          .sort({ employeeId: 1, effectiveFrom: -1, createdAt: -1 })
          .lean(),

        AttendancePeriod.find({
          employeeId: { $in: employeeIds },
          periodKey: payPeriod,
        })
          .sort({ employeeId: 1, periodEnd: -1, createdAt: -1 })
          .lean(),

        Payroll.find({
          employeeId: { $in: employeeIds },
          payPeriod,
          ...(req.query.payrollStatus
            ? { status: normalize(req.query.payrollStatus) }
            : {}),
        })
          .sort({ employeeId: 1, payDate: -1, createdAt: -1 })
          .lean(),

        PayrollStatutoryRule.find({
          countryCode: "JM",
          status: "Active",
          effectiveFrom: { $lte: toEndOfDay(asOfDate) },
          $or: [
            { effectiveTo: null },
            { effectiveTo: { $gte: toStartOfDay(asOfDate) } },
          ],
        })
          .sort({ effectiveFrom: -1, createdAt: -1 })
          .lean(),

        MinimumWageRule.find({
          status: "Active",
          effectiveFrom: { $lte: toEndOfDay(asOfDate) },
          $or: [
            { effectiveTo: null },
            { effectiveTo: { $gte: toStartOfDay(asOfDate) } },
          ],
        })
          .sort({ workerCategory: 1, effectiveFrom: -1 })
          .lean(),
      ]);

    const compensationByEmployee = mapLatestByEmployee(compensations);
    const attendanceByEmployee = mapLatestByEmployee(attendancePeriods);
    const payrollByEmployee = mapLatestByEmployee(payrollRecords);

    let employeeRegister = employees.map((employee) => {
      const compensation = compensationByEmployee.get(employee.employeeId) || null;
      const attendancePeriod = attendanceByEmployee.get(employee.employeeId) || null;
      const latestPayroll = payrollByEmployee.get(employee.employeeId) || null;
      const eligibility = buildEligibility({
        employee,
        compensation,
        attendancePeriod,
        latestPayroll,
      });

      return {
        employeeId: employee.employeeId,
        fullName: employee.fullName,
        jobTitle: employee.jobTitle || "",
        department: employee.department || "",
        branch: employee.branch || "",
        employmentStatus: employee.employmentStatus || "",
        payrollEnabled: employee.payrollEnabled === true,
        payrollEligibilityStatus: employee.payrollEligibilityStatus || "",
        payrollEligibilityReason: employee.payrollEligibilityReason || "",
        attendanceRequired: employee.attendanceRequired !== false,
        activeCompensation: compensation
          ? {
              compensationNumber: compensation.compensationNumber,
              compensationType: compensation.compensationType,
              amount: Number(compensation.amount || 0),
              currency: compensation.currency || "JMD",
              rateUnit: compensation.rateUnit,
              payFrequency: compensation.payFrequency,
              effectiveFrom: compensation.effectiveFrom,
              effectiveTo: compensation.effectiveTo || "",
            }
          : null,
        attendance: attendancePeriod
          ? {
              periodNumber: attendancePeriod.periodNumber,
              status: attendancePeriod.status,
              periodStart: attendancePeriod.periodStart,
              periodEnd: attendancePeriod.periodEnd,
              payableMinutes: Number(
                attendancePeriod.totals?.payableWorkedMinutes || 0
              ),
              pendingAdjustments: eligibility.pendingAdjustments,
              leaveReviewDays: Number(
                attendancePeriod.totals?.leavePayrollReviewDayCount || 0
              ),
            }
          : null,
        latestPayroll: latestPayroll
          ? {
              payrollNumber: latestPayroll.payrollNumber,
              status: latestPayroll.status,
              grossPay: Number(latestPayroll.grossPay || 0),
              netPay: Number(latestPayroll.netPay || 0),
              statutoryRuleCode: latestPayroll.statutoryRuleCode || "",
              complianceStatus: eligibility.complianceStatus,
            }
          : null,
        eligibilityStatus: eligibility.status,
        complianceStatus: eligibility.complianceStatus,
        blockers: eligibility.blockers,
      };
    });

    if (req.query.readinessStatus) {
      employeeRegister = employeeRegister.filter(
        (row) => row.eligibilityStatus === normalize(req.query.readinessStatus)
      );
    }

    if (req.query.complianceStatus) {
      employeeRegister = employeeRegister.filter(
        (row) => row.complianceStatus === normalize(req.query.complianceStatus)
      );
    }

    const payrollComplianceRecords = payrollRecords.map((payroll) => ({
      payrollNumber: payroll.payrollNumber,
      employeeId: payroll.employeeId,
      employeeName: payroll.employeeName,
      payPeriod: payroll.payPeriod,
      payDate: payroll.payDate,
      status: payroll.status,
      compensationType: payroll.compensationType,
      grossPay: Number(payroll.grossPay || 0),
      totalDeductions: Number(
        payroll.totalDeductions ?? payroll.deductions ?? 0
      ),
      netPay: Number(payroll.netPay || 0),
      statutoryTreatment: payroll.statutoryTreatment || "Standard",
      statutoryRuleCode: payroll.statutoryRuleCode || "",
      statutoryRuleName: payroll.statutoryRuleName || "",
      minimumWageAssessment: payroll.minimumWageAssessment || {},
      leavePayrollAssessment: payroll.leavePayrollAssessment || {},
      complianceStatus: resolveComplianceStatus(payroll),
      approvalBlocked:
        payroll.status === "Pending" &&
        ["Non-Compliant", "Review Required", "Not Assessed"].includes(
          resolveComplianceStatus(payroll)
        ),
    }));

    const summary = {
      employees: employeeRegister.length,
      payrollEnabled: employeeRegister.filter((row) => row.payrollEnabled).length,
      eligible: employeeRegister.filter(
        (row) => row.eligibilityStatus === "Eligible"
      ).length,
      blocked: employeeRegister.filter(
        (row) => row.eligibilityStatus === "Blocked"
      ).length,
      missingCompensation: employeeRegister.filter(
        (row) => !row.activeCompensation
      ).length,
      attendanceNotReady: employeeRegister.filter(
        (row) =>
          row.attendanceRequired &&
          !["Payroll Ready", "Locked"].includes(row.attendance?.status)
      ).length,
      payrollRecords: payrollComplianceRecords.length,
      pendingPayroll: payrollComplianceRecords.filter(
        (row) => row.status === "Pending"
      ).length,
      approvedPayroll: payrollComplianceRecords.filter(
        (row) => row.status === "Approved"
      ).length,
      paidPayroll: payrollComplianceRecords.filter((row) => row.status === "Paid")
        .length,
      compliantPayroll: payrollComplianceRecords.filter(
        (row) => row.complianceStatus === "Compliant"
      ).length,
      nonCompliantPayroll: payrollComplianceRecords.filter(
        (row) => row.complianceStatus === "Non-Compliant"
      ).length,
      reviewRequiredPayroll: payrollComplianceRecords.filter(
        (row) => row.complianceStatus === "Review Required"
      ).length,
      legacyStatutoryRecords: payrollComplianceRecords.filter(
        (row) => !row.statutoryRuleCode
      ).length,
      grossPay: roundMoney(
        payrollComplianceRecords.reduce((sum, row) => sum + row.grossPay, 0)
      ),
      netPay: roundMoney(
        payrollComplianceRecords.reduce((sum, row) => sum + row.netPay, 0)
      ),
      minimumWageShortfall: roundMoney(
        payrollComplianceRecords.reduce(
          (sum, row) =>
            sum + Number(row.minimumWageAssessment?.shortfall || 0),
          0
        )
      ),
    };

    const filters = {
      employees: employees.map((employee) => ({
        employeeId: employee.employeeId,
        fullName: employee.fullName,
      })),
      departments: [...new Set(employees.map((row) => row.department).filter(Boolean))].sort(),
      branches: [...new Set(employees.map((row) => row.branch).filter(Boolean))].sort(),
    };

    try {
      await writeAuditLog({
        req,
        action: "VIEW_HR_PAYROLL_COMPLIANCE_REPORT",
        module: "HR",
        description: `Viewed payroll eligibility and compliance report for ${payPeriod}.`,
        targetType: "HRReport",
        targetId: `PAYROLL-COMPLIANCE-${payPeriod}`,
        metadata: {
          asOfDate,
          payPeriod,
          employeeCount: summary.employees,
          payrollRecordCount: summary.payrollRecords,
          blockedCount: summary.blocked,
          nonCompliantCount: summary.nonCompliantPayroll,
        },
      });
    } catch (auditError) {
      console.error("Payroll compliance report audit error:", auditError.message);
    }

    return res.json({
      success: true,
      message: "Payroll eligibility and compliance report generated successfully.",
      asOfDate,
      payPeriod,
      appliedFilters: {
        employeeId: normalize(req.query.employeeId),
        department: normalize(req.query.department),
        branch: normalize(req.query.branch),
        employmentStatus: normalize(req.query.employmentStatus),
        eligibilityStatus: normalize(req.query.eligibilityStatus),
        payrollStatus: normalize(req.query.payrollStatus),
        readinessStatus: normalize(req.query.readinessStatus),
        complianceStatus: normalize(req.query.complianceStatus),
      },
      summary,
      filters,
      employeeRegister,
      payrollComplianceRecords,
      effectiveRules: {
        statutory: statutoryRules,
        minimumWage: wageRules,
      },
    });
  } catch (error) {
    console.error("Payroll eligibility and compliance report error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate payroll eligibility and compliance report.",
      error: error.message,
    });
  }
};

module.exports = {
  getPayrollEligibilityComplianceReport,
};