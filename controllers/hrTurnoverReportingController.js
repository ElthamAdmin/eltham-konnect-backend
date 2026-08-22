const HREmployee = require("../models/HREmployee");
const EmployeeLifecycleCase = require(
  "../models/EmployeeLifecycleCase"
);

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalize = (value) => String(value || "").trim();
const ymd = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? normalize(value).slice(0, 10)
    : date.toISOString().slice(0, 10);
};

const jamaicaToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const addMonths = (dateText, months) => {
  const date = new Date(`${dateText}T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};

const daysBetween = (start, end) => {
  if (!start || !end) return null;
  const startDate = new Date(`${start}T12:00:00.000Z`);
  const endDate = new Date(`${end}T12:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  return Math.max(0, Math.round((endDate - startDate) / 86400000));
};

const percent = (part, total) =>
  total > 0 ? Number(((part / total) * 100).toFixed(2)) : 0;

const buildBreakdown = (records, getter) => {
  const counts = new Map();
  records.forEach((record) => {
    const label = normalize(getter(record)) || "Not Specified";
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      percentage: percent(count, records.length),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const getCaseEffectiveDate = (record) =>
  ymd(record.actualEffectiveDate || record.completedAt || record.plannedEffectiveDate);

const isEmployeeActiveOn = (employee, dateText, offboardingDateByEmployee) => {
  const startDate = ymd(employee.startDate);
  const separationDate = offboardingDateByEmployee.get(employee.employeeId) || "";
  if (startDate && startDate > dateText) return false;
  if (separationDate && separationDate <= dateText) return false;
  return true;
};

const getTurnoverAndLifecycleReport = async (req, res) => {
  try {
    const today = jamaicaToday();
    const startDate = normalize(req.query.startDate) || addMonths(today, -12);
    const endDate = normalize(req.query.endDate) || today;

    if (!YMD_PATTERN.test(startDate) || !YMD_PATTERN.test(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Reporting dates must use YYYY-MM-DD.",
      });
    }
    if (endDate < startDate) {
      return res.status(400).json({
        success: false,
        message: "Report end date cannot be earlier than its start date.",
      });
    }

    const filters = {
      startDate,
      endDate,
      employeeId: normalize(req.query.employeeId),
      department: normalize(req.query.department),
      branch: normalize(req.query.branch),
      caseType: normalize(req.query.caseType),
      status: normalize(req.query.status),
    };

    const [employees, allCases] = await Promise.all([
      HREmployee.find().lean(),
      EmployeeLifecycleCase.find().sort({ createdAt: -1 }).lean(),
    ]);

    const employeeById = new Map(
      employees.map((employee) => [employee.employeeId, employee])
    );

    const filteredEmployees = employees.filter((employee) => {
      if (filters.employeeId && employee.employeeId !== filters.employeeId) return false;
      if (filters.department && normalize(employee.department) !== filters.department) return false;
      if (filters.branch && normalize(employee.branch) !== filters.branch) return false;
      return true;
    });

    const completedOffboarding = allCases.filter(
      (record) => record.caseType === "Offboarding" && record.status === "Completed"
    );
    const offboardingDateByEmployee = new Map();
    completedOffboarding.forEach((record) => {
      const date = getCaseEffectiveDate(record);
      const existing = offboardingDateByEmployee.get(record.employeeId);
      if (date && (!existing || date < existing)) {
        offboardingDateByEmployee.set(record.employeeId, date);
      }
    });

    const cases = allCases.filter((record) => {
      const employee = employeeById.get(record.employeeId) || {};
      const snapshot = record.employeeSnapshot || {};
      const effectiveDate = getCaseEffectiveDate(record);
      if (effectiveDate && (effectiveDate < startDate || effectiveDate > endDate)) return false;
      if (filters.employeeId && record.employeeId !== filters.employeeId) return false;
      if (filters.department && normalize(snapshot.department || employee.department) !== filters.department) return false;
      if (filters.branch && normalize(snapshot.branch || employee.branch) !== filters.branch) return false;
      if (filters.caseType && record.caseType !== filters.caseType) return false;
      if (filters.status && record.status !== filters.status) return false;
      return true;
    });

    const completedCases = cases.filter((record) => record.status === "Completed");
    const onboardings = completedCases.filter((record) => record.caseType === "Onboarding");
    const separations = completedCases.filter((record) => record.caseType === "Offboarding");
    const blocked = cases.filter((record) => record.status === "Blocked");
    const openCases = cases.filter(
      (record) => !["Completed", "Cancelled"].includes(record.status)
    );
    const overdue = openCases.filter((record) => {
      const planned = ymd(record.plannedEffectiveDate);
      return planned && planned < today;
    });

    const startHeadcount = filteredEmployees.filter((employee) =>
      isEmployeeActiveOn(employee, startDate, offboardingDateByEmployee)
    ).length;
    const endHeadcount = filteredEmployees.filter((employee) =>
      isEmployeeActiveOn(employee, endDate, offboardingDateByEmployee)
    ).length;
    const averageHeadcount = Number(((startHeadcount + endHeadcount) / 2).toFixed(2));

    const completionDays = completedCases
      .map((record) => daysBetween(ymd(record.createdAt), getCaseEffectiveDate(record)))
      .filter((value) => value !== null);
    const averageCompletionDays = completionDays.length
      ? Number((completionDays.reduce((sum, value) => sum + value, 0) / completionDays.length).toFixed(2))
      : 0;

    const inconsistencies = completedOffboarding
      .map((record) => {
        const employee = employeeById.get(record.employeeId);
        if (!employee) {
          return {
            employeeId: record.employeeId,
            fullName: record.employeeSnapshot?.fullName || "Unknown Employee",
            issue: "Completed offboarding has no matching employee master record.",
            lifecycleCaseNumber: record.lifecycleCaseNumber,
          };
        }
        if (employee.employmentStatus !== "Terminated") {
          return {
            employeeId: employee.employeeId,
            fullName: employee.fullName,
            issue: `Completed offboarding exists but employee status is ${employee.employmentStatus || "not specified"}.`,
            lifecycleCaseNumber: record.lifecycleCaseNumber,
          };
        }
        return null;
      })
      .filter(Boolean);

    const register = cases.map((record) => {
      const employee = employeeById.get(record.employeeId) || {};
      const snapshot = record.employeeSnapshot || {};
      const effectiveDate = getCaseEffectiveDate(record);
      return {
        lifecycleCaseNumber: record.lifecycleCaseNumber,
        employeeId: record.employeeId,
        fullName: snapshot.fullName || employee.fullName || "Unknown Employee",
        department: snapshot.department || employee.department || "",
        branch: snapshot.branch || employee.branch || "",
        caseType: record.caseType,
        reason: record.reason || "",
        status: record.status,
        plannedEffectiveDate: ymd(record.plannedEffectiveDate),
        actualEffectiveDate: ymd(record.actualEffectiveDate),
        completedAt: ymd(record.completedAt),
        completionDays:
          record.status === "Completed"
            ? daysBetween(ymd(record.createdAt), effectiveDate)
            : null,
        overdue:
          !["Completed", "Cancelled"].includes(record.status) &&
          Boolean(ymd(record.plannedEffectiveDate)) &&
          ymd(record.plannedEffectiveDate) < today,
      };
    });

    return res.json({
      success: true,
      message: "Turnover and employee-lifecycle report generated successfully.",
      asOfDate: today,
      filters,
      summary: {
        totalCases: cases.length,
        openCases: openCases.length,
        completedCases: completedCases.length,
        completedOnboardings: onboardings.length,
        completedOffboardings: separations.length,
        blockedCases: blocked.length,
        overdueCases: overdue.length,
        startHeadcount,
        endHeadcount,
        averageHeadcount,
        turnoverRate: percent(separations.length, averageHeadcount),
        averageCompletionDays,
        masterRecordInconsistencies: inconsistencies.length,
      },
      breakdowns: {
        byStatus: buildBreakdown(cases, (record) => record.status),
        byCaseType: buildBreakdown(cases, (record) => record.caseType),
        byDepartment: buildBreakdown(cases, (record) =>
          record.employeeSnapshot?.department || employeeById.get(record.employeeId)?.department
        ),
        byBranch: buildBreakdown(cases, (record) =>
          record.employeeSnapshot?.branch || employeeById.get(record.employeeId)?.branch
        ),
        offboardingReasons: buildBreakdown(separations, (record) => record.reason),
      },
      inconsistencies,
      data: register,
    });
  } catch (error) {
    console.error("Turnover and lifecycle reporting error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate the turnover and employee-lifecycle report.",
      error: error.message,
    });
  }
};

module.exports = {
  getTurnoverAndLifecycleReport,
};