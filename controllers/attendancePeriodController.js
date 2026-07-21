const {
  buildAttendancePeriodPreview,
} = require(
  "../services/attendancePeriodService"
);

const previewAttendancePeriod =
  async (req, res) => {
    try {
      const {
        employeeId,
        periodKey,
        periodStart,
        periodEnd,
        defaultStartTime = "",
        defaultEndTime = "",
        lateGraceMinutes = 0,
        publicHolidays = [],
      } = req.body;

      const normalizedPeriodKey =
        String(
          periodKey || ""
        ).trim();

      if (!normalizedPeriodKey) {
        return res.status(400).json({
          success: false,
          message:
            "Attendance period key is required.",
        });
      }

      const {
        employee,
        periodDraft,
      } =
        await buildAttendancePeriodPreview({
          employeeId,
          periodKey:
            normalizedPeriodKey,
          periodStart,
          periodEnd,
          defaultStartTime,
          defaultEndTime,
          lateGraceMinutes,
          publicHolidays,
        });

      return res.json({
        success: true,
        message:
          "Attendance period preview generated successfully. No attendance period was created.",
        data: {
          employee: {
            employeeId:
              employee.employeeId,
            fullName:
              employee.fullName,
            jobTitle:
              employee.jobTitle,
            department:
              employee.department,
            branch:
              employee.branch,
            linkedUserId:
              employee.linkedUserId,
            attendanceRequired:
              employee.attendanceRequired,
            payrollEnabled:
              employee.payrollEnabled,
            payrollEligibilityStatus:
              employee
                .payrollEligibilityStatus,
          },
          period: periodDraft,
        },
      });
    } catch (error) {
      console.error(
        "Attendance period preview error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not generate attendance period preview.",
      });
    }
  };

module.exports = {
  previewAttendancePeriod,
};