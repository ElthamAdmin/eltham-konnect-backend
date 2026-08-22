const HREmployee = require("../models/HREmployee");
const LeaveRequest = require("../models/LeaveRequest");
const Payroll = require("../models/Payroll");
const AttendanceLog = require("../models/AttendanceLog");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const formatMinutes = (minutes) => {
  const numericMinutes = Number(minutes || 0);
  const hours = Math.floor(numericMinutes / 60);
  const mins = numericMinutes % 60;
  return `${hours}h ${mins}m`;
};

const normalizeText = (value) =>
  String(value || "").trim();

const normalizeDate = (value) => {
  const text = normalizeText(value);

  if (!text) return "";

  const parsedDate = new Date(`${text}T00:00:00`);

  return Number.isNaN(parsedDate.getTime())
    ? ""
    : text;
};

const calculateAge = (dateOfBirth, asOfDate) => {
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  const referenceDate = new Date(`${asOfDate}T00:00:00`);

  if (
    Number.isNaN(birthDate.getTime()) ||
    Number.isNaN(referenceDate.getTime()) ||
    birthDate > referenceDate
  ) {
    return null;
  }

  let age =
    referenceDate.getFullYear() -
    birthDate.getFullYear();

  const monthDifference =
    referenceDate.getMonth() -
    birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (
      monthDifference === 0 &&
      referenceDate.getDate() <
        birthDate.getDate()
    )
  ) {
    age -= 1;
  }

  return age;
};

const calculateTenureMonths = (
  startDate,
  asOfDate
) => {
  const employmentStart =
    new Date(`${startDate}T00:00:00`);

  const referenceDate =
    new Date(`${asOfDate}T00:00:00`);

  if (
    Number.isNaN(employmentStart.getTime()) ||
    Number.isNaN(referenceDate.getTime()) ||
    employmentStart > referenceDate
  ) {
    return null;
  }

  let months =
    (
      referenceDate.getFullYear() -
      employmentStart.getFullYear()
    ) *
      12 +
    (
      referenceDate.getMonth() -
      employmentStart.getMonth()
    );

  if (
    referenceDate.getDate() <
    employmentStart.getDate()
  ) {
    months -= 1;
  }

  return Math.max(0, months);
};

const incrementCount = (
  accumulator,
  value,
  fallback = "Not Specified"
) => {
  const key =
    normalizeText(value) || fallback;

  accumulator[key] =
    Number(accumulator[key] || 0) + 1;
};

const objectToBreakdown = (values = {}) =>
  Object.entries(values)
    .map(([label, count]) => ({
      label,
      count,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.label.localeCompare(right.label)
    );

const getAgeBand = (age) => {
  if (age === null) return "Not Specified";
  if (age < 25) return "Under 25";
  if (age <= 34) return "25–34";
  if (age <= 44) return "35–44";
  if (age <= 54) return "45–54";
  return "55+";
};

const getTenureBand = (months) => {
  if (months === null) return "Not Specified";
  if (months < 6) return "Under 6 Months";
  if (months < 12) return "6–11 Months";
  if (months < 24) return "1–2 Years";
  if (months < 60) return "2–5 Years";
  return "5+ Years";
};

const getHRAnalyticsDashboard = async (
  req,
  res
) => {
  try {
    const today =
      new Date().toISOString().slice(0, 10);

    const requestedAsOfDate =
      normalizeDate(req.query.asOfDate);

    const asOfDate =
      requestedAsOfDate || today;

    const filters = {
      search:
        normalizeText(req.query.search),
      branch:
        normalizeText(req.query.branch),
      department:
        normalizeText(req.query.department),
      employmentStatus:
        normalizeText(
          req.query.employmentStatus
        ),
      employmentType:
        normalizeText(
          req.query.employmentType
        ),
    };

    const [
      employees,
      leaveRequests,
      payrollRecords,
      attendanceLogs,
    ] = await Promise.all([
      HREmployee.find().lean(),
      LeaveRequest.find().lean(),
      Payroll.find().lean(),
      AttendanceLog.find().lean(),
    ]);

    const searchText =
      filters.search.toLowerCase();

    const filteredEmployees =
      employees.filter((employee) => {
        if (
          filters.branch &&
          employee.branch !== filters.branch
        ) {
          return false;
        }

        if (
          filters.department &&
          employee.department !==
            filters.department
        ) {
          return false;
        }

        if (
          filters.employmentStatus &&
          employee.employmentStatus !==
            filters.employmentStatus
        ) {
          return false;
        }

        if (
          filters.employmentType &&
          employee.employmentType !==
            filters.employmentType
        ) {
          return false;
        }

        if (searchText) {
          const searchableValue = [
            employee.employeeId,
            employee.fullName,
            employee.jobTitle,
            employee.department,
            employee.branch,
            employee.email,
          ]
            .map((value) =>
              normalizeText(value).toLowerCase()
            )
            .join(" ");

          if (
            !searchableValue.includes(searchText)
          ) {
            return false;
          }
        }

        return true;
      });

    const filteredEmployeeIds =
      new Set(
        filteredEmployees.map((employee) =>
          normalizeText(employee.employeeId)
        )
      );

    const relatedLeaveRequests =
      leaveRequests.filter((request) =>
        filteredEmployeeIds.has(
          normalizeText(request.employeeId)
        )
      );

    const relatedPayrollRecords =
      payrollRecords.filter((record) =>
        filteredEmployeeIds.has(
          normalizeText(record.employeeId)
        )
      );

    const relatedAttendanceLogs =
      attendanceLogs.filter((log) => {
        const employeeId =
          normalizeText(log.employeeId);

        if (employeeId) {
          return filteredEmployeeIds.has(
            employeeId
          );
        }

        return true;
      });

    const counts = {
      employmentStatus: {},
      department: {},
      branch: {},
      employmentType: {},
      employmentClassification: {},
      contractType: {},
      gender: {},
      ageBand: {},
      tenureBand: {},
      jobLevel: {},
      payrollEligibility: {},
    };

    let payrollEnabledEmployees = 0;
    let payrollDisabledEmployees = 0;
    let departmentHeads = 0;
    let employeesWithManagers = 0;
    let employeesWithoutManagers = 0;
    let employeesWithPhotos = 0;
    let employeesMissingPhotos = 0;

    const employeeRegister =
      filteredEmployees
        .map((employee) => {
          const age =
            calculateAge(
              employee.dateOfBirth,
              asOfDate
            );

          const tenureMonths =
            calculateTenureMonths(
              employee.startDate,
              asOfDate
            );

          incrementCount(
            counts.employmentStatus,
            employee.employmentStatus
          );

          incrementCount(
            counts.department,
            employee.department
          );

          incrementCount(
            counts.branch,
            employee.branch
          );

          incrementCount(
            counts.employmentType,
            employee.employmentType
          );

          incrementCount(
            counts.employmentClassification,
            employee.employmentClassification
          );

          incrementCount(
            counts.contractType,
            employee.contractType
          );

          incrementCount(
            counts.gender,
            employee.gender
          );

          incrementCount(
            counts.ageBand,
            getAgeBand(age)
          );

          incrementCount(
            counts.tenureBand,
            getTenureBand(tenureMonths)
          );

          incrementCount(
            counts.jobLevel,
            employee.jobLevel
              ? `Level ${employee.jobLevel}`
              : ""
          );

          incrementCount(
            counts.payrollEligibility,
            employee.payrollEligibilityStatus
          );

          if (employee.payrollEnabled) {
            payrollEnabledEmployees += 1;
          } else {
            payrollDisabledEmployees += 1;
          }

          if (employee.isDepartmentHead) {
            departmentHeads += 1;
          }

          if (
            normalizeText(
              employee.reportsToEmployeeId
            )
          ) {
            employeesWithManagers += 1;
          } else {
            employeesWithoutManagers += 1;
          }

          const photoUrl =
            normalizeText(
              employee.profilePhoto?.url ||
                employee.profilePhoto?.secureUrl
            );

          if (photoUrl) {
            employeesWithPhotos += 1;
          } else {
            employeesMissingPhotos += 1;
          }

          return {
            employeeId:
              employee.employeeId,
            fullName:
              employee.fullName,
            jobTitle:
              employee.jobTitle,
            jobLevel:
              Number(employee.jobLevel || 1),
            department:
              employee.department,
            branch:
              employee.branch,
            employmentType:
              employee.employmentType,
            employmentClassification:
              employee.employmentClassification ||
              "",
            contractType:
              employee.contractType || "",
            employmentStatus:
              employee.employmentStatus,
            startDate:
              employee.startDate || "",
            endDate:
              employee.endDate || "",
            gender:
              employee.gender || "",
            age,
            tenureMonths,
            tenureYears:
              tenureMonths === null
                ? null
                : roundMoney(
                    tenureMonths / 12
                  ),
            reportsToEmployeeId:
              employee.reportsToEmployeeId ||
              "",
            reportsToName:
              employee.reportsToName || "",
            isDepartmentHead:
              Boolean(
                employee.isDepartmentHead
              ),
            payrollEnabled:
              Boolean(
                employee.payrollEnabled
              ),
            payrollEligibilityStatus:
              employee.payrollEligibilityStatus ||
              "",
            hasProfilePhoto:
              Boolean(photoUrl),
          };
        })
        .sort((left, right) =>
          left.fullName.localeCompare(
            right.fullName
          )
        );

    const totalEmployees =
      filteredEmployees.length;

    const activeEmployees =
      filteredEmployees.filter(
        (employee) =>
          employee.employmentStatus ===
          "Active"
      ).length;

    const inactiveEmployees =
      filteredEmployees.filter(
        (employee) =>
          employee.employmentStatus ===
          "Inactive"
      ).length;

    const onLeaveEmployees =
      filteredEmployees.filter(
        (employee) =>
          employee.employmentStatus ===
          "On Leave"
      ).length;

    const terminatedEmployees =
      filteredEmployees.filter(
        (employee) =>
          employee.employmentStatus ===
          "Terminated"
      ).length;

    const totalDisciplineRecords =
      filteredEmployees.reduce(
        (sum, employee) =>
          sum +
          Number(
            employee.disciplineRecords
              ?.length || 0
          ),
        0
      );

    const totalPerformanceReviews =
      filteredEmployees.reduce(
        (sum, employee) =>
          sum +
          Number(
            employee.performanceReviews
              ?.length || 0
          ),
        0
      );

    const totalEmployeeDocuments =
      filteredEmployees.reduce(
        (sum, employee) =>
          sum +
          Number(
            employee.documents?.length || 0
          ),
        0
      );

    const pendingLeaveRequests =
      relatedLeaveRequests.filter(
        (request) =>
          request.status === "Pending"
      ).length;

    const approvedLeaveRequests =
      relatedLeaveRequests.filter(
        (request) =>
          request.status === "Approved"
      ).length;

    const rejectedLeaveRequests =
      relatedLeaveRequests.filter(
        (request) =>
          request.status === "Rejected"
      ).length;

    const totalGrossPayroll =
      roundMoney(
        relatedPayrollRecords.reduce(
          (sum, record) =>
            sum +
            Number(record.grossPay || 0),
          0
        )
      );

    const totalNetPayroll =
      roundMoney(
        relatedPayrollRecords.reduce(
          (sum, record) =>
            sum +
            Number(record.netPay || 0),
          0
        )
      );

    const averageNetPay =
      relatedPayrollRecords.length > 0
        ? roundMoney(
            totalNetPayroll /
              relatedPayrollRecords.length
          )
        : 0;

    const totalWorkedMinutes =
      relatedAttendanceLogs.reduce(
        (sum, log) =>
          sum +
          Number(log.workedMinutes || 0),
        0
      );

    const totalLunchMinutes =
      relatedAttendanceLogs.reduce(
        (sum, log) =>
          sum +
          Number(log.lunchMinutes || 0),
        0
      );

    const averageWorkedMinutes =
      relatedAttendanceLogs.length > 0
        ? Math.round(
            totalWorkedMinutes /
              relatedAttendanceLogs.length
          )
        : 0;

    return res.json({
      success: true,
      message:
        "Headcount and workforce report generated successfully.",
      generatedAt: new Date(),
      asOfDate,
      filters,
      data: {
        workforce: {
          totalEmployees,
          activeEmployees,
          inactiveEmployees,
          onLeaveEmployees,
          terminatedEmployees,
          payrollEnabledEmployees,
          payrollDisabledEmployees,
          departmentHeads,
          employeesWithManagers,
          employeesWithoutManagers,
          employeesWithPhotos,
          employeesMissingPhotos,
          activeRate:
            totalEmployees > 0
              ? roundMoney(
                  (
                    activeEmployees /
                    totalEmployees
                  ) * 100
                )
              : 0,
          payrollEnabledRate:
            totalEmployees > 0
              ? roundMoney(
                  (
                    payrollEnabledEmployees /
                    totalEmployees
                  ) * 100
                )
              : 0,
        },

        workforceBreakdowns: {
          byEmploymentStatus:
            objectToBreakdown(
              counts.employmentStatus
            ),
          byDepartment:
            objectToBreakdown(
              counts.department
            ),
          byBranch:
            objectToBreakdown(
              counts.branch
            ),
          byEmploymentType:
            objectToBreakdown(
              counts.employmentType
            ),
          byEmploymentClassification:
            objectToBreakdown(
              counts.employmentClassification
            ),
          byContractType:
            objectToBreakdown(
              counts.contractType
            ),
          byGender:
            objectToBreakdown(
              counts.gender
            ),
          byAgeBand:
            objectToBreakdown(
              counts.ageBand
            ),
          byTenure:
            objectToBreakdown(
              counts.tenureBand
            ),
          byJobLevel:
            objectToBreakdown(
              counts.jobLevel
            ),
          byPayrollEligibility:
            objectToBreakdown(
              counts.payrollEligibility
            ),
        },

        employeeRegister,

        discipline: {
          totalDisciplineRecords,
        },

        performance: {
          totalPerformanceReviews,
        },

        documents: {
          totalEmployeeDocuments,
        },

        leave: {
          totalLeaveRequests:
            relatedLeaveRequests.length,
          pendingLeaveRequests,
          approvedLeaveRequests,
          rejectedLeaveRequests,
        },

        payroll: {
          totalPayrollRecords:
            relatedPayrollRecords.length,
          totalGrossPayroll,
          totalNetPayroll,
          averageNetPay,
        },

        attendance: {
          totalAttendanceRecords:
            relatedAttendanceLogs.length,
          totalWorkedMinutes,
          totalLunchMinutes,
          totalWorkedLabel:
            formatMinutes(
              totalWorkedMinutes
            ),
          totalLunchLabel:
            formatMinutes(
              totalLunchMinutes
            ),
          averageWorkedMinutes,
          averageWorkedLabel:
            formatMinutes(
              averageWorkedMinutes
            ),
        },
      },
    });
  } catch (error) {
    console.error(
      "Error generating headcount and workforce report:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to generate the headcount and workforce report.",
      error: error.message,
    });
  }
};

module.exports = {
  getHRAnalyticsDashboard,
};