const AttendancePeriod = require(
  "../models/AttendancePeriod"
);

const {
  buildAttendancePeriodPreview,
} = require(
  "../services/attendancePeriodService"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const PERIOD_KEY_PATTERN =
  /^\d{4}-(0[1-9]|1[0-2])$/;

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const normalizeString = (value) =>
  String(value || "").trim();

const validatePeriodRequest = ({
  periodKey,
  periodStart,
  periodEnd,
}) => {
  const normalizedPeriodKey =
    normalizeString(periodKey);

  if (
    !PERIOD_KEY_PATTERN.test(
      normalizedPeriodKey
    )
  ) {
    throw new Error(
      "Attendance period key must use YYYY-MM format."
    );
  }

  const normalizedStart =
    normalizeString(periodStart);

  const normalizedEnd =
    normalizeString(periodEnd);

  if (
    !normalizedStart.startsWith(
      `${normalizedPeriodKey}-`
    ) ||
    !normalizedEnd.startsWith(
      `${normalizedPeriodKey}-`
    )
  ) {
    throw new Error(
      "Attendance period dates must belong to the selected period key."
    );
  }

  return normalizedPeriodKey;
};

const buildSafeAttendanceAuditSnapshot = (
  period
) => ({
  periodNumber: period.periodNumber,
  employeeId: period.employeeId,
  periodKey: period.periodKey,
  periodStart: period.periodStart,
  periodEnd: period.periodEnd,
  status: period.status,
  scheduledDayCount: Number(
    period.totals?.scheduledDayCount || 0
  ),
  presentDayCount: Number(
    period.totals?.presentDayCount || 0
  ),
  absentDayCount: Number(
    period.totals?.absentDayCount || 0
  ),
  leaveDayCount: Number(
    period.totals?.leaveDayCount || 0
  ),
  incompleteDayCount: Number(
    period.totals?.incompleteDayCount || 0
  ),
  payableWorkedMinutes: Number(
    period.totals
      ?.payableWorkedMinutes || 0
  ),
  overtimeMinutes: Number(
    period.totals?.overtimeMinutes || 0
  ),
  restDayMinutes: Number(
    period.totals?.restDayMinutes || 0
  ),
  publicHolidayMinutes: Number(
    period.totals
      ?.publicHolidayMinutes || 0
  ),
  sourceAttendanceRecordCount:
    Array.isArray(
      period.sourceAttendanceNumbers
    )
      ? period.sourceAttendanceNumbers
          .length
      : 0,
});

const generateAttendancePreview =
  async (body = {}) => {
    const {
      employeeId,
      periodKey,
      periodStart,
      periodEnd,
      defaultStartTime = "",
      defaultEndTime = "",
      lateGraceMinutes = 0,
      publicHolidays = [],
    } = body;

    const normalizedPeriodKey =
      validatePeriodRequest({
        periodKey,
        periodStart,
        periodEnd,
      });

    return buildAttendancePeriodPreview({
      employeeId,
      periodKey: normalizedPeriodKey,
      periodStart:
        normalizeString(periodStart),
      periodEnd:
        normalizeString(periodEnd),
      defaultStartTime,
      defaultEndTime,
      lateGraceMinutes,
      publicHolidays,
    });
  };

const previewAttendancePeriod =
  async (req, res) => {
    try {
      const {
        employee,
        periodDraft,
      } =
        await generateAttendancePreview(
          req.body || {}
        );

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

const createAttendancePeriodDraft =
  async (req, res) => {
    try {
      const {
        employee,
        periodDraft,
      } =
        await generateAttendancePreview(
          req.body || {}
        );

      /*
       * The unique employeeId + periodKey index is the
       * final database safeguard. This explicit check
       * provides a clearer API response.
       */
      const existingPeriod =
        await AttendancePeriod.findOne({
          employeeId:
            periodDraft.employeeId,
          periodKey:
            periodDraft.periodKey,
        }).select(
          "periodNumber status employeeId periodKey"
        );

      if (existingPeriod) {
        return res.status(409).json({
          success: false,
          message:
            `${employee.fullName} already has attendance period ` +
            `${existingPeriod.periodNumber} for ${existingPeriod.periodKey}.`,
          data: {
            periodNumber:
              existingPeriod.periodNumber,
            employeeId:
              existingPeriod.employeeId,
            periodKey:
              existingPeriod.periodKey,
            status:
              existingPeriod.status,
          },
        });
      }

      const userName =
        getUserName(req.user);

      periodDraft.status = "Draft";
      periodDraft.generatedBy =
        userName;
      periodDraft.generatedAt =
        new Date();
      periodDraft.createdBy =
        userName;
      periodDraft.updatedBy =
        userName;
      periodDraft.notes =
        normalizeString(
          req.body?.notes
        );

      periodDraft.workflowHistory = [
        {
          fromStatus: "",
          toStatus: "Draft",
          action:
            "Attendance period draft generated",
          notes:
            "Draft generated from employee schedule, raw attendance logs and approved leave records.",
          performedBy: userName,
          performedAt: new Date(),
        },
      ];

      /*
       * All daily entries and totals come from the
       * server-side preview builder. The request cannot
       * submit or override calculated totals.
       */
      const attendancePeriod =
        await AttendancePeriod.create(
          periodDraft
        );

      await writeAuditLog({
        req,
        action:
          "CREATE_ATTENDANCE_PERIOD_DRAFT",
        module: "HR",
        description:
          `Attendance period ${attendancePeriod.periodNumber} created for ${attendancePeriod.employeeId}`,
        targetType:
          "AttendancePeriod",
        targetId:
          attendancePeriod.periodNumber,
        afterValues:
          buildSafeAttendanceAuditSnapshot(
            attendancePeriod
          ),
        metadata: {
          source:
            "Controlled Attendance Period",
          calculationMode:
            "System Generated",
          containsFutureDates:
            attendancePeriod.dailyEntries.some(
              (entry) =>
                entry.dayStatus ===
                "No Record" &&
                entry.scheduledWorkday ===
                  true
            ),
        },
      });

      return res.status(201).json({
        success: true,
        message:
          "Draft attendance period created successfully.",
        data: attendancePeriod,
      });
    } catch (error) {
      console.error(
        "Attendance period draft creation error:",
        error
      );

      if (error?.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            "An attendance period already exists for this employee and period.",
        });
      }

      if (
        error?.name ===
        "ValidationError"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Attendance period validation failed.",
          error: error.message,
        });
      }

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not create attendance period draft.",
      });
    }
  };

  const getAttendancePeriods =
  async (req, res) => {
    try {
      const employeeId =
        normalizeString(
          req.query.employeeId
        );

      const periodKey =
        normalizeString(
          req.query.periodKey
        );

      const status =
        normalizeString(
          req.query.status
        );

      const periodNumber =
        normalizeString(
          req.query.periodNumber
        );

      const filter = {};

      if (employeeId) {
        filter.employeeId =
          employeeId;
      }

      if (periodKey) {
        if (
          !PERIOD_KEY_PATTERN.test(
            periodKey
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Attendance period key must use YYYY-MM format.",
          });
        }

        filter.periodKey = periodKey;
      }

      if (status) {
        filter.status = status;
      }

      if (periodNumber) {
        filter.periodNumber =
          periodNumber;
      }

      const attendancePeriods =
        await AttendancePeriod.find(
          filter
        ).sort({
          periodStart: -1,
          employeeId: 1,
          createdAt: -1,
        });

      const summary = {
        totalRecords:
          attendancePeriods.length,
        draftRecords: 0,
        submittedRecords: 0,
        managerApprovedRecords: 0,
        payrollReadyRecords: 0,
        lockedRecords: 0,
        exceptionRecords: 0,
      };

      for (
        const period of
        attendancePeriods
      ) {
        if (period.status === "Draft") {
          summary.draftRecords += 1;
        }

        if (
          period.status ===
          "Submitted"
        ) {
          summary.submittedRecords += 1;
        }

        if (
          period.status ===
          "Manager Approved"
        ) {
          summary.managerApprovedRecords +=
            1;
        }

        if (
          period.status ===
          "Payroll Ready"
        ) {
          summary.payrollReadyRecords +=
            1;
        }

        if (period.status === "Locked") {
          summary.lockedRecords += 1;
        }

        const hasExceptions =
          period.dailyEntries.some(
            (entry) =>
              entry.dayStatus ===
                "Incomplete" ||
              Boolean(
                String(
                  entry.exceptionNotes ||
                    ""
                ).trim()
              )
          );

        if (hasExceptions) {
          summary.exceptionRecords += 1;
        }
      }

      return res.json({
        success: true,
        message:
          "Attendance periods retrieved successfully.",
        totalRecords:
          attendancePeriods.length,
        summary,
        data: attendancePeriods,
      });
    } catch (error) {
      console.error(
        "Attendance period retrieval error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not retrieve attendance periods.",
        error: error.message,
      });
    }
  };

module.exports = {
  getAttendancePeriods,
  previewAttendancePeriod,
  createAttendancePeriodDraft,
};