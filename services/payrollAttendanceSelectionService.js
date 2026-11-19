const AttendancePeriod = require("../models/AttendancePeriod");

const clean = (value) => String(value ?? "").trim();

const selectPayrollAttendance = async ({
  employeeId,
  payPeriod,
  attendancePeriodNumber = "",
  session = null,
}) => {
  const employee = clean(employeeId);
  const period = clean(payPeriod);
  const number = clean(attendancePeriodNumber);

  if (!employee || !period) {
    return {
      attendancePeriod: null,
      warning: "An employee and pay period are required to select attendance.",
    };
  }

  const filter = {
    employeeId: employee,
    periodKey: period,
    status: { $in: ["Payroll Ready", "Locked"] },
  };

  if (number) filter.periodNumber = number;

  // Two matches are enough to establish that the choice is ambiguous.
  const query = AttendancePeriod.find(filter).limit(2);
  if (session) query.session(session);
  const matches = await query;

  if (matches.length === 1) {
    return { attendancePeriod: matches[0], warning: "" };
  }

  if (matches.length === 0) {
    return {
      attendancePeriod: null,
      warning: number
        ? `Attendance ${number} is not Payroll Ready or Locked for ${employee} in ${period}.`
        : `No Payroll Ready or Locked attendance was found for ${employee} in ${period}.`,
    };
  }

  return {
    attendancePeriod: null,
    warning: number
      ? `More than one attendance record matches ${number} for ${employee}. Review the duplicate records.`
      : `More than one attendance period is ready for ${employee} in ${period}. Select the exact attendance period before preparing payroll.`,
  };
};

module.exports = { selectPayrollAttendance };