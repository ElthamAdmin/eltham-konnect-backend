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

const getHRAnalyticsDashboard = async (req, res) => {
  try {
    const employees = await HREmployee.find();
    const leaveRequests = await LeaveRequest.find();
    const payrollRecords = await Payroll.find();
    const attendanceLogs = await AttendanceLog.find();

    const totalEmployees = employees.length;
    const activeEmployees = employees.filter(
      (employee) => employee.employmentStatus === "Active"
    ).length;
    const inactiveEmployees = employees.filter(
      (employee) => employee.employmentStatus === "Inactive"
    ).length;
    const onLeaveEmployees = employees.filter(
      (employee) => employee.employmentStatus === "On Leave"
    ).length;
    const terminatedEmployees = employees.filter(
      (employee) => employee.employmentStatus === "Terminated"
    ).length;
    const payrollEnabledEmployees = employees.filter(
      (employee) => employee.payrollEnabled === true
    ).length;

    const totalDisciplineRecords = employees.reduce(
      (sum, employee) => sum + Number(employee.disciplineRecords?.length || 0),
      0
    );

    const totalPerformanceReviews = employees.reduce(
      (sum, employee) => sum + Number(employee.performanceReviews?.length || 0),
      0
    );

    const totalEmployeeDocuments = employees.reduce(
      (sum, employee) => sum + Number(employee.documents?.length || 0),
      0
    );

    const pendingLeaveRequests = leaveRequests.filter(
      (request) => request.status === "Pending"
    ).length;

    const approvedLeaveRequests = leaveRequests.filter(
      (request) => request.status === "Approved"
    ).length;

    const rejectedLeaveRequests = leaveRequests.filter(
      (request) => request.status === "Rejected"
    ).length;

    const totalPayrollRecords = payrollRecords.length;

    const totalGrossPayroll = roundMoney(
      payrollRecords.reduce(
        (sum, record) => sum + Number(record.grossPay || 0),
        0
      )
    );

    const totalNetPayroll = roundMoney(
      payrollRecords.reduce(
        (sum, record) => sum + Number(record.netPay || 0),
        0
      )
    );

    const averageNetPay =
      payrollRecords.length > 0
        ? roundMoney(totalNetPayroll / payrollRecords.length)
        : 0;

    const totalAttendanceRecords = attendanceLogs.length;

    const totalWorkedMinutes = attendanceLogs.reduce(
      (sum, log) => sum + Number(log.workedMinutes || 0),
      0
    );

    const totalLunchMinutes = attendanceLogs.reduce(
      (sum, log) => sum + Number(log.lunchMinutes || 0),
      0
    );

    const averageWorkedMinutes =
      attendanceLogs.length > 0
        ? Math.round(totalWorkedMinutes / attendanceLogs.length)
        : 0;

    res.json({
      success: true,
      message: "HR analytics dashboard retrieved successfully",
      data: {
        workforce: {
          totalEmployees,
          activeEmployees,
          inactiveEmployees,
          onLeaveEmployees,
          terminatedEmployees,
          payrollEnabledEmployees,
        },
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
          totalLeaveRequests: leaveRequests.length,
          pendingLeaveRequests,
          approvedLeaveRequests,
          rejectedLeaveRequests,
        },
        payroll: {
          totalPayrollRecords,
          totalGrossPayroll,
          totalNetPayroll,
          averageNetPay,
        },
        attendance: {
          totalAttendanceRecords,
          totalWorkedMinutes,
          totalLunchMinutes,
          totalWorkedLabel: formatMinutes(totalWorkedMinutes),
          totalLunchLabel: formatMinutes(totalLunchMinutes),
          averageWorkedMinutes,
          averageWorkedLabel: formatMinutes(averageWorkedMinutes),
        },
      },
    });
  } catch (error) {
    console.error("Error getting HR analytics dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve HR analytics dashboard",
      error: error.message,
    });
  }
};

module.exports = {
  getHRAnalyticsDashboard,
};