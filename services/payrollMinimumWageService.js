const AttendancePeriod = require(
  "../models/AttendancePeriod"
);

const {
  buildMinimumWageAssessment,
} = require(
  "./minimumWageService"
);

const roundHours = (value) =>
  Math.round(
    (Number(value || 0) +
      Number.EPSILON) *
      100
  ) / 100;

const resolvePayrollMinimumWageAssessment =
  async ({
    employeeId = "",
    payPeriod = "",
    assessmentDate,
    grossPay,
    applicable = true,
    workerCategory = "General",
    manualWorkedHours = 0,
    attendancePeriodNumber = "",
  }) => {
    const normalizedEmployeeId =
      String(
        employeeId || ""
      ).trim();

    const normalizedPayPeriod =
      String(
        payPeriod || ""
      ).trim();

    /*
     * Payroll not linked to an HR employee remains a
     * controlled manual workflow. Its hours are identified
     * explicitly as manual evidence.
     */
    if (!normalizedEmployeeId) {
      const manualAssessment =
        await buildMinimumWageAssessment({
          assessmentDate,
          workedHours:
            manualWorkedHours,
          grossPay,
          applicable,
          workerCategory,
          attendancePeriodNumber: "",
        });

      return {
        ...manualAssessment,
        attendancePeriodId: null,
        attendancePeriodNumber: "",
        attendancePeriodStatus: "",
        payableHoursSource:
          applicable
            ? "Manual Preview"
            : "Not Applicable",
      };
    }

    /*
     * Minimum-wage applicability cannot be switched off merely
     * by a client request for an employee-linked Payroll record.
     */
    const attendanceQuery = {
      employeeId:
        normalizedEmployeeId,
      periodKey:
        normalizedPayPeriod,
      status: {
        $in: [
          "Payroll Ready",
          "Locked",
        ],
      },
    };

    if (
      String(
        attendancePeriodNumber ||
          ""
      ).trim()
    ) {
      attendanceQuery.periodNumber =
        String(
          attendancePeriodNumber
        ).trim();
    }

    const attendancePeriod =
      await AttendancePeriod.findOne(
        attendanceQuery
      ).sort({
        payrollReadyAt: -1,
        updatedAt: -1,
      });

    if (!attendancePeriod) {
      const unassessedResult =
        await buildMinimumWageAssessment({
          assessmentDate,
          workedHours: 0,
          grossPay,
          applicable: true,
          workerCategory,
          attendancePeriodNumber:
            String(
              attendancePeriodNumber ||
                ""
            ).trim(),
        });

      return {
        ...unassessedResult,
        compliant: false,
        assessmentStatus:
          "Not Assessed",
        warning:
          `A Payroll Ready attendance period is required for ` +
          `${normalizedEmployeeId}, period ${normalizedPayPeriod}, ` +
          `before minimum-wage compliance can be confirmed.`,
        attendancePeriodId: null,
        attendancePeriodNumber:
          String(
            attendancePeriodNumber ||
              ""
          ).trim(),
        attendancePeriodStatus: "",
        payableHoursSource:
          "Payroll Ready Attendance",
      };
    }

    const payableWorkedMinutes =
      Math.max(
        0,
        Number(
          attendancePeriod
            .totals
            ?.payableWorkedMinutes ||
            0
        )
      );

    const payableWorkedHours =
      roundHours(
        payableWorkedMinutes /
          60
      );

    const assessment =
      await buildMinimumWageAssessment({
        assessmentDate,
        workedHours:
          payableWorkedHours,
        grossPay,
        applicable: true,
        workerCategory,
        attendancePeriodNumber:
          attendancePeriod.periodNumber,
      });

    return {
      ...assessment,
      attendancePeriodId:
        attendancePeriod._id,
      attendancePeriodNumber:
        attendancePeriod.periodNumber,
      attendancePeriodStatus:
        attendancePeriod.status,
      payableHoursSource:
        "Payroll Ready Attendance",
    };
  };

module.exports = {
  resolvePayrollMinimumWageAssessment,
};