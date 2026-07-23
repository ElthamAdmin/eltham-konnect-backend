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

const getJamaicaTodayYmd = () => {
  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "America/Jamaica",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [
      part.type,
      part.value,
    ])
  );

  return `${values.year}-${values.month}-${values.day}`;
};

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

const getAttendanceWeekKey = (
  workDate
) => {
  const date = new Date(
    `${workDate}T12:00:00.000Z`
  );

  const daysFromMonday =
    (date.getUTCDay() + 6) % 7;

  date.setUTCDate(
    date.getUTCDate() -
      daysFromMonday
  );

  return date
    .toISOString()
    .slice(0, 10);
};

const recalculateAttendancePeriodTotals = (
  attendancePeriod
) => {
  const approvedByDate = new Map();

  for (
    const adjustment of
      attendancePeriod.adjustments || []
  ) {
    if (
      adjustment.status !==
      "Approved"
    ) {
      continue;
    }

    const workDate =
      normalizeString(
        adjustment.workDate
      );

    approvedByDate.set(
      workDate,
      Number(
        approvedByDate.get(
          workDate
        ) || 0
      ) +
        Number(
          adjustment.minutesAdjustment ||
            0
        )
    );
  }

  const entries = [
    ...(attendancePeriod.dailyEntries || []),
  ].sort((left, right) =>
    String(left.workDate).localeCompare(
      String(right.workDate)
    )
  );

  const weeklyPayableMinutes =
    new Map();

  const overtimeThresholdMinutes =
    Math.max(
      0,
      Number(
        attendancePeriod
          .scheduleSnapshot
          ?.overtimeThresholdHoursPerWeek ||
          40
      ) * 60
    );

  for (const entry of entries) {
    const previousApprovedMinutes =
      Number(
        entry.approvedAdjustmentMinutes ||
          0
      );

    const sourcePayableMinutes =
      Math.max(
        0,
        Number(
          entry.payableWorkedMinutes ||
            0
        ) - previousApprovedMinutes
      );

    const approvedMinutes =
      Number(
        approvedByDate.get(
          entry.workDate
        ) || 0
      );

    const payableWorkedMinutes =
      Math.max(
        0,
        sourcePayableMinutes +
          approvedMinutes
      );

    entry.approvedAdjustmentMinutes =
      approvedMinutes;

    entry.payableWorkedMinutes =
      payableWorkedMinutes;

    if (
      payableWorkedMinutes > 0 &&
      [
        "Absent",
        "Incomplete",
        "No Record",
      ].includes(entry.dayStatus)
    ) {
      entry.dayStatus = "Present";
    }

    if (
      entry.scheduledWorkday === true &&
      entry.approvedLeave !== true &&
      entry.publicHoliday !== true
    ) {
      entry.absenceMinutes =
        Math.max(
          0,
          Number(
            entry.scheduledMinutes || 0
          ) - payableWorkedMinutes
        );

      if (
        payableWorkedMinutes === 0 &&
        entry.workDate <=
          getJamaicaTodayYmd()
      ) {
        entry.dayStatus = "Absent";
      }
    } else {
      entry.absenceMinutes = 0;
    }

    const weekKey =
      getAttendanceWeekKey(
        entry.workDate
      );

    const priorWeekMinutes =
      Number(
        weeklyPayableMinutes.get(
          weekKey
        ) || 0
      );

    const updatedWeekMinutes =
      priorWeekMinutes +
      payableWorkedMinutes;

    const overtimeBefore =
      Math.max(
        0,
        priorWeekMinutes -
          overtimeThresholdMinutes
      );

    const overtimeAfter =
      Math.max(
        0,
        updatedWeekMinutes -
          overtimeThresholdMinutes
      );

    entry.overtimeMinutes =
      Math.max(
        0,
        overtimeAfter -
          overtimeBefore
      );

    entry.regularMinutes =
      Math.max(
        0,
        payableWorkedMinutes -
          entry.overtimeMinutes
      );

    entry.restDayMinutes =
      entry.restDay === true
        ? payableWorkedMinutes
        : 0;

    entry.publicHolidayMinutes =
      entry.publicHoliday === true
        ? payableWorkedMinutes
        : 0;

    weeklyPayableMinutes.set(
      weekKey,
      updatedWeekMinutes
    );
  }

  const sum = (fieldName) =>
    entries.reduce(
      (total, entry) =>
        total +
        Number(entry[fieldName] || 0),
      0
    );

  attendancePeriod.totals = {
    scheduledMinutes:
      sum("scheduledMinutes"),
    sourceWorkedMinutes:
      sum("sourceWorkedMinutes"),
    approvedAdjustmentMinutes:
      sum(
        "approvedAdjustmentMinutes"
      ),
    payableWorkedMinutes:
      sum("payableWorkedMinutes"),
    regularMinutes:
      sum("regularMinutes"),
    lateMinutes:
      sum("lateMinutes"),
    absenceMinutes:
      sum("absenceMinutes"),
    overtimeMinutes:
      sum("overtimeMinutes"),
    restDayMinutes:
      sum("restDayMinutes"),
    publicHolidayMinutes:
      sum("publicHolidayMinutes"),
    scheduledDayCount:
      entries.filter(
        (entry) =>
          entry.scheduledWorkday ===
          true
      ).length,
    presentDayCount:
      entries.filter(
        (entry) =>
          entry.dayStatus === "Present"
      ).length,
    absentDayCount:
      entries.filter(
        (entry) =>
          entry.dayStatus === "Absent"
      ).length,
    leaveDayCount:
      entries.filter(
        (entry) =>
          entry.dayStatus ===
          "Approved Leave"
      ).length,
    incompleteDayCount:
      entries.filter(
        (entry) =>
          entry.dayStatus ===
          "Incomplete"
      ).length,
  };

  attendancePeriod.markModified(
    "dailyEntries"
  );

  attendancePeriod.markModified(
    "totals"
  );
};

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

  const refreshAttendancePeriodDraft =
  async (req, res) => {
    try {
      const periodNumber =
        normalizeString(
          req.params.periodNumber
        );

      const attendancePeriod =
        await AttendancePeriod.findOne({
          periodNumber,
        });

      if (!attendancePeriod) {
        return res.status(404).json({
          success: false,
          message:
            "Attendance period was not found.",
        });
      }

      if (
        ![
          "Draft",
          "Reopened",
        ].includes(
          attendancePeriod.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `Attendance period ${periodNumber} cannot be refreshed while its status is ${attendancePeriod.status}.`,
        });
      }

      if (
        Array.isArray(
          attendancePeriod.adjustments
        ) &&
        attendancePeriod.adjustments
          .length > 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This attendance period contains controlled adjustments and cannot be automatically refreshed.",
        });
      }

      const beforeSnapshot =
        buildSafeAttendanceAuditSnapshot(
          attendancePeriod
        );

      const requestContainsHolidays =
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "publicHolidays"
        );

      const preservedPublicHolidays =
        attendancePeriod.dailyEntries
          .filter(
            (entry) =>
              entry.publicHoliday ===
              true
          )
          .map((entry) => ({
            date: entry.workDate,
            name:
              entry.publicHolidayName,
          }));

      const publicHolidays =
        requestContainsHolidays
          ? req.body.publicHolidays
          : preservedPublicHolidays;

      const {
        periodDraft,
      } =
        await generateAttendancePreview({
          employeeId:
            attendancePeriod.employeeId,
          periodKey:
            attendancePeriod.periodKey,
          periodStart:
            attendancePeriod.periodStart,
          periodEnd:
            attendancePeriod.periodEnd,
          defaultStartTime:
            attendancePeriod
              .scheduleSnapshot
              ?.defaultStartTime || "",
          defaultEndTime:
            attendancePeriod
              .scheduleSnapshot
              ?.defaultEndTime || "",
          lateGraceMinutes:
            attendancePeriod
              .scheduleSnapshot
              ?.lateGraceMinutes || 0,
          publicHolidays,
        });

      const userName =
        getUserName(req.user);

      /*
       * Preserve the existing period identity and workflow.
       * Only the server-generated employee, schedule,
       * attendance and totals snapshots are refreshed.
       */
      attendancePeriod.employeeSnapshot =
        periodDraft.employeeSnapshot;

      attendancePeriod.scheduleSnapshot =
        periodDraft.scheduleSnapshot;

      attendancePeriod.dailyEntries =
        periodDraft.dailyEntries;

      attendancePeriod.totals =
        periodDraft.totals;

      attendancePeriod.sourceAttendanceNumbers =
        periodDraft.sourceAttendanceNumbers;

      attendancePeriod.generatedBy =
        userName;

      attendancePeriod.generatedAt =
        new Date();

      attendancePeriod.updatedBy =
        userName;

      if (
        req.body?.notes !== undefined
      ) {
        attendancePeriod.notes =
          normalizeString(
            req.body.notes
          );
      }

      attendancePeriod.workflowHistory.push({
        fromStatus:
          attendancePeriod.status,
        toStatus:
          attendancePeriod.status,
        action:
          "Attendance period refreshed",
        notes:
          normalizeString(
            req.body?.refreshNotes
          ) ||
          "Draft refreshed from the current employee schedule, raw attendance logs and approved leave records.",
        performedBy: userName,
        performedAt: new Date(),
      });

      await attendancePeriod.save();

      await writeAuditLog({
        req,
        action:
          "REFRESH_ATTENDANCE_PERIOD_DRAFT",
        module: "HR",
        description:
          `Attendance period ${attendancePeriod.periodNumber} refreshed`,
        targetType:
          "AttendancePeriod",
        targetId:
          attendancePeriod.periodNumber,
        beforeValues:
          beforeSnapshot,
        afterValues:
          buildSafeAttendanceAuditSnapshot(
            attendancePeriod
          ),
        metadata: {
          source:
            "Controlled Attendance Period",
          calculationMode:
            "System Regenerated",
          publicHolidayCount:
            publicHolidays.length,
        },
      });

      return res.json({
        success: true,
        message:
          `${attendancePeriod.periodNumber} refreshed successfully.`,
        data: attendancePeriod,
      });
    } catch (error) {
      console.error(
        "Attendance period refresh error:",
        error
      );

      if (
        error?.name ===
        "ValidationError"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Refreshed attendance period validation failed.",
          error: error.message,
        });
      }

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not refresh attendance period.",
      });
    }
  };

  const requestAttendanceAdjustment =
  async (req, res) => {
    try {
      const periodNumber =
        normalizeString(
          req.params.periodNumber
        );

      const attendancePeriod =
        await AttendancePeriod.findOne({
          periodNumber,
        });

      if (!attendancePeriod) {
        return res.status(404).json({
          success: false,
          message:
            "Attendance period was not found.",
        });
      }

      if (
        ![
          "Draft",
          "Reopened",
        ].includes(
          attendancePeriod.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `Adjustments cannot be requested while ${periodNumber} has status ${attendancePeriod.status}.`,
        });
      }

      const workDate =
        normalizeString(
          req.body?.workDate
        );

      const adjustmentType =
        normalizeString(
          req.body?.adjustmentType
        );

      const reason =
        normalizeString(
          req.body?.reason
        );

      const supportingReference =
        normalizeString(
          req.body
            ?.supportingReference
        );

      const minutesAdjustment =
        Math.round(
          Number(
            req.body
              ?.minutesAdjustment || 0
          )
        );

      const allowedAdjustmentTypes = [
        "Clock In",
        "Clock Out",
        "Lunch",
        "Worked Time",
        "Late Arrival",
        "Absence",
        "Overtime",
        "Rest-Day Work",
        "Public-Holiday Work",
        "Other",
      ];

      if (
        workDate <
          attendancePeriod.periodStart ||
        workDate >
          attendancePeriod.periodEnd
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Adjustment work date must fall within the attendance period.",
        });
      }

      const dailyEntry =
        attendancePeriod.dailyEntries.find(
          (entry) =>
            entry.workDate === workDate
        );

      if (!dailyEntry) {
        return res.status(400).json({
          success: false,
          message:
            `Attendance date ${workDate} was not found in ${periodNumber}.`,
        });
      }

      if (
        !allowedAdjustmentTypes.includes(
          adjustmentType
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A valid attendance adjustment type is required.",
        });
      }

      if (!reason) {
        return res.status(400).json({
          success: false,
          message:
            "An adjustment reason is required.",
        });
      }

      if (
        !Number.isFinite(
          minutesAdjustment
        ) ||
        minutesAdjustment === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Minutes adjustment must be a non-zero whole number.",
        });
      }

      if (
        Math.abs(minutesAdjustment) >
        1440
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A single attendance adjustment cannot exceed 1,440 minutes.",
        });
      }

      const existingPendingAdjustment =
        attendancePeriod.adjustments.find(
          (adjustment) =>
            adjustment.workDate ===
              workDate &&
            adjustment.adjustmentType ===
              adjustmentType &&
            adjustment.status ===
              "Pending"
        );

      if (
        existingPendingAdjustment
      ) {
        return res.status(409).json({
          success: false,
          message:
            `A Pending ${adjustmentType} adjustment already exists for ${workDate}.`,
          data: {
            adjustmentNumber:
              existingPendingAdjustment
                .adjustmentNumber,
            status:
              existingPendingAdjustment
                .status,
          },
        });
      }

      const userName =
        getUserName(req.user);

      const adjustmentNumber =
        `ATTADJ-${Date.now()}-` +
        `${Math.floor(
          1000 +
            Math.random() * 9000
        )}`;

      attendancePeriod.adjustments.push({
        adjustmentNumber,
        workDate,
        adjustmentType,
        minutesAdjustment,
        reason,
        supportingReference,
        status: "Pending",
        requestedBy: userName,
        requestedAt: new Date(),
        reviewedBy: "",
        reviewedAt: null,
        reviewNotes: "",
      });

      attendancePeriod.updatedBy =
        userName;

      attendancePeriod.workflowHistory.push({
        fromStatus:
          attendancePeriod.status,
        toStatus:
          attendancePeriod.status,
        action:
          "Attendance adjustment requested",
        notes:
          `${adjustmentNumber} requested for ${workDate}: ${adjustmentType}.`,
        performedBy: userName,
        performedAt: new Date(),
      });

      await attendancePeriod.save();

      await writeAuditLog({
        req,
        action:
          "REQUEST_ATTENDANCE_ADJUSTMENT",
        module: "HR",
        description:
          `Attendance adjustment ${adjustmentNumber} requested for ${periodNumber}`,
        targetType:
          "AttendancePeriod",
        targetId:
          periodNumber,
        metadata: {
          adjustmentNumber,
          employeeId:
            attendancePeriod.employeeId,
          periodKey:
            attendancePeriod.periodKey,
          workDate,
          adjustmentType,
          minutesAdjustment,
          supportingReferenceProvided:
            Boolean(
              supportingReference
            ),
          status: "Pending",
        },
      });

      const savedAdjustment =
        attendancePeriod.adjustments.find(
          (adjustment) =>
            adjustment
              .adjustmentNumber ===
            adjustmentNumber
        );

      return res.status(201).json({
        success: true,
        message:
          "Attendance adjustment request created successfully. No attendance totals were changed.",
        data: {
          periodNumber:
            attendancePeriod.periodNumber,
          employeeId:
            attendancePeriod.employeeId,
          periodKey:
            attendancePeriod.periodKey,
          periodStatus:
            attendancePeriod.status,
          adjustment:
            savedAdjustment,
          totals:
            attendancePeriod.totals,
        },
      });
    } catch (error) {
      console.error(
        "Attendance adjustment request error:",
        error
      );

      if (
        error?.name ===
        "ValidationError"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Attendance adjustment validation failed.",
          error: error.message,
        });
      }

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not create attendance adjustment request.",
      });
    }
  };

const reviewAttendanceAdjustment =
  async (req, res) => {
    try {
      const periodNumber =
        normalizeString(
          req.params.periodNumber
        );

      const adjustmentNumber =
        normalizeString(
          req.params.adjustmentNumber
        );

      const action =
        normalizeString(
          req.body?.action
        );

      const reviewNotes =
        normalizeString(
          req.body?.reviewNotes
        );

      if (
        !["Approve", "Reject"].includes(
          action
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Adjustment review action must be Approve or Reject.",
        });
      }

      if (!reviewNotes) {
        return res.status(400).json({
          success: false,
          message:
            "Adjustment review notes are required.",
        });
      }

      const attendancePeriod =
        await AttendancePeriod.findOne({
          periodNumber,
        });

      if (!attendancePeriod) {
        return res.status(404).json({
          success: false,
          message:
            "Attendance period was not found.",
        });
      }

      if (
        !["Draft", "Reopened"].includes(
          attendancePeriod.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `Adjustments cannot be reviewed while ${periodNumber} has status ${attendancePeriod.status}.`,
        });
      }

      const adjustment =
        attendancePeriod.adjustments.find(
          (item) =>
            item.adjustmentNumber ===
            adjustmentNumber
        );

      if (!adjustment) {
        return res.status(404).json({
          success: false,
          message:
            "Attendance adjustment was not found.",
        });
      }

      if (
        adjustment.status !== "Pending"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${adjustmentNumber} has already been ${adjustment.status}.`,
        });
      }

      const userName =
        getUserName(req.user);

      const beforeSnapshot =
        buildSafeAttendanceAuditSnapshot(
          attendancePeriod
        );

      adjustment.status =
        action === "Approve"
          ? "Approved"
          : "Rejected";

      adjustment.reviewedBy =
        userName;

      adjustment.reviewedAt =
        new Date();

      adjustment.reviewNotes =
        reviewNotes;

      if (action === "Approve") {
        recalculateAttendancePeriodTotals(
          attendancePeriod
        );
      }

      attendancePeriod.updatedBy =
        userName;

      attendancePeriod.workflowHistory.push({
        fromStatus:
          attendancePeriod.status,
        toStatus:
          attendancePeriod.status,
        action:
          `Attendance adjustment ${adjustment.status.toLowerCase()}`,
        notes:
          `${adjustmentNumber}: ${reviewNotes}`,
        performedBy: userName,
        performedAt: new Date(),
      });

      await attendancePeriod.save();

      await writeAuditLog({
        req,
        action:
          action === "Approve"
            ? "APPROVE_ATTENDANCE_ADJUSTMENT"
            : "REJECT_ATTENDANCE_ADJUSTMENT",
        module: "HR",
        description:
          `Attendance adjustment ${adjustmentNumber} ${adjustment.status.toLowerCase()} for ${periodNumber}`,
        targetType:
          "AttendancePeriod",
        targetId: periodNumber,
        beforeValues: beforeSnapshot,
        afterValues:
          buildSafeAttendanceAuditSnapshot(
            attendancePeriod
          ),
        metadata: {
          adjustmentNumber,
          employeeId:
            attendancePeriod.employeeId,
          periodKey:
            attendancePeriod.periodKey,
          workDate:
            adjustment.workDate,
          adjustmentType:
            adjustment.adjustmentType,
          minutesAdjustment:
            adjustment.minutesAdjustment,
          decision:
            adjustment.status,
          reviewedBy: userName,
        },
      });

      return res.json({
        success: true,
        message:
          `${adjustmentNumber} ${adjustment.status.toLowerCase()} successfully.`,
        data: attendancePeriod,
      });
    } catch (error) {
      console.error(
        "Attendance adjustment review error:",
        error
      );

      if (
        error?.name ===
        "ValidationError"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Attendance adjustment review validation failed.",
          error: error.message,
        });
      }

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not review attendance adjustment.",
      });
    }
  };

const reopenAttendancePeriod =
  async (req, res) => {
    try {
      const periodNumber =
        normalizeString(
          req.params.periodNumber
        );

      const reason =
        normalizeString(
          req.body?.reason
        );

      if (!reason) {
        return res.status(400).json({
          success: false,
          message:
            "A reopening reason is required.",
        });
      }

      const attendancePeriod =
        await AttendancePeriod.findOne({
          periodNumber,
        });

      if (!attendancePeriod) {
        return res.status(404).json({
          success: false,
          message:
            "Attendance period was not found.",
        });
      }

      if (
        ![
          "Submitted",
          "Manager Approved",
          "Payroll Ready",
        ].includes(
          attendancePeriod.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${periodNumber} cannot be reopened while its status is ${attendancePeriod.status}.`,
        });
      }

      if (
        normalizeString(
          attendancePeriod.payrollNumber
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            "An attendance period linked to payroll cannot be reopened. Reverse or cancel the related payroll first.",
          data: {
            payrollNumber:
              attendancePeriod.payrollNumber,
          },
        });
      }

      const userName =
        getUserName(req.user);

      const previousStatus =
        attendancePeriod.status;

      attendancePeriod.status =
        "Reopened";

      attendancePeriod.submittedBy = "";
      attendancePeriod.submittedAt = null;
      attendancePeriod.managerApprovedBy = "";
      attendancePeriod.managerApprovedAt = null;
      attendancePeriod.managerApprovalNotes = "";
      attendancePeriod.payrollReadyBy = "";
      attendancePeriod.payrollReadyAt = null;
      attendancePeriod.payrollReadinessNotes = "";
      attendancePeriod.updatedBy = userName;

      attendancePeriod.workflowHistory.push({
        fromStatus: previousStatus,
        toStatus: "Reopened",
        action:
          "Attendance period reopened",
        notes: reason,
        performedBy: userName,
        performedAt: new Date(),
      });

      await attendancePeriod.save();

      await writeAuditLog({
        req,
        action:
          "REOPEN_ATTENDANCE_PERIOD",
        module: "HR",
        description:
          `Attendance period ${periodNumber} reopened`,
        targetType:
          "AttendancePeriod",
        targetId: periodNumber,
        beforeValues: {
          status: previousStatus,
        },
        afterValues:
          buildSafeAttendanceAuditSnapshot(
            attendancePeriod
          ),
        metadata: {
          employeeId:
            attendancePeriod.employeeId,
          periodKey:
            attendancePeriod.periodKey,
          reopenedBy: userName,
          reason,
        },
      });

      return res.json({
        success: true,
        message:
          `${periodNumber} reopened successfully.`,
        data: attendancePeriod,
      });
    } catch (error) {
      console.error(
        "Attendance period reopening error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not reopen attendance period.",
      });
    }
  };

const lockAttendancePeriod =
  async (req, res) => {
    try {
      const periodNumber =
        normalizeString(
          req.params.periodNumber
        );

      const payrollNumber =
        normalizeString(
          req.body?.payrollNumber
        );

      const notes =
        normalizeString(
          req.body?.notes
        );

      if (!payrollNumber) {
        return res.status(400).json({
          success: false,
          message:
            "A payroll number is required before an attendance period can be locked.",
        });
      }

      if (!notes) {
        return res.status(400).json({
          success: false,
          message:
            "Attendance locking notes are required.",
        });
      }

      const attendancePeriod =
        await AttendancePeriod.findOne({
          periodNumber,
        });

      if (!attendancePeriod) {
        return res.status(404).json({
          success: false,
          message:
            "Attendance period was not found.",
        });
      }

      if (
        attendancePeriod.status !==
        "Payroll Ready"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${periodNumber} must have Payroll Ready status before it can be locked.`,
          data: {
            currentStatus:
              attendancePeriod.status,
            requiredStatus:
              "Payroll Ready",
          },
        });
      }

      const pendingAdjustments =
        attendancePeriod.adjustments
          .filter(
            (adjustment) =>
              adjustment.status ===
              "Pending"
          )
          .map(
            (adjustment) =>
              adjustment.adjustmentNumber
          );

      if (
        pendingAdjustments.length > 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Pending attendance adjustments must be resolved before locking.",
          pendingAdjustments,
        });
      }

      const userName =
        getUserName(req.user);

      const previousStatus =
        attendancePeriod.status;

      attendancePeriod.status =
        "Locked";

      attendancePeriod.payrollNumber =
        payrollNumber;

      attendancePeriod.updatedBy =
        userName;

      attendancePeriod.workflowHistory.push({
        fromStatus: previousStatus,
        toStatus: "Locked",
        action:
          "Attendance period locked to payroll",
        notes:
          `${notes} Payroll: ${payrollNumber}.`,
        performedBy: userName,
        performedAt: new Date(),
      });

      await attendancePeriod.save();

      await writeAuditLog({
        req,
        action:
          "LOCK_ATTENDANCE_PERIOD",
        module: "HR",
        description:
          `Attendance period ${periodNumber} locked to payroll ${payrollNumber}`,
        targetType:
          "AttendancePeriod",
        targetId: periodNumber,
        beforeValues: {
          status: previousStatus,
          payrollNumber: "",
        },
        afterValues: {
          ...buildSafeAttendanceAuditSnapshot(
            attendancePeriod
          ),
          payrollNumber,
        },
        metadata: {
          employeeId:
            attendancePeriod.employeeId,
          periodKey:
            attendancePeriod.periodKey,
          payrollNumber,
          lockedBy: userName,
        },
      });

      return res.json({
        success: true,
        message:
          `${periodNumber} locked successfully.`,
        data: attendancePeriod,
      });
    } catch (error) {
      console.error(
        "Attendance period locking error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not lock attendance period.",
      });
    }
  };

  const submitAttendancePeriod =
  async (req, res) => {
    try {
      const periodNumber =
        normalizeString(
          req.params.periodNumber
        );

      const attendancePeriod =
        await AttendancePeriod.findOne({
          periodNumber,
        });

      if (!attendancePeriod) {
        return res.status(404).json({
          success: false,
          message:
            "Attendance period was not found.",
        });
      }

      if (
        ![
          "Draft",
          "Reopened",
        ].includes(
          attendancePeriod.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${periodNumber} cannot be submitted while its status is ${attendancePeriod.status}.`,
        });
      }

      const today =
        getJamaicaTodayYmd();

      if (
        attendancePeriod.periodEnd >
        today
      ) {
        return res.status(409).json({
          success: false,
          message:
            "An attendance period cannot be submitted before its period end date.",
          data: {
            periodNumber,
            periodEnd:
              attendancePeriod.periodEnd,
            currentDate: today,
            currentStatus:
              attendancePeriod.status,
          },
        });
      }

      const futureOrUnassessedDates =
        attendancePeriod.dailyEntries
          .filter(
            (entry) =>
              entry.scheduledWorkday ===
                true &&
              entry.dayStatus ===
                "No Record"
          )
          .map(
            (entry) =>
              entry.workDate
          );

      if (
        futureOrUnassessedDates.length >
        0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "All scheduled dates must be assessed before the attendance period can be submitted.",
          invalidDates:
            futureOrUnassessedDates,
        });
      }

      const incompleteDates =
        attendancePeriod.dailyEntries
          .filter(
            (entry) =>
              entry.dayStatus ===
              "Incomplete"
          )
          .map(
            (entry) =>
              entry.workDate
          );

      if (
        incompleteDates.length > 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Incomplete attendance dates must be resolved before submission.",
          invalidDates:
            incompleteDates,
        });
      }

      const pendingAdjustments =
        attendancePeriod.adjustments
          .filter(
            (adjustment) =>
              adjustment.status ===
              "Pending"
          )
          .map(
            (adjustment) =>
              adjustment
                .adjustmentNumber
          );

      if (
        pendingAdjustments.length > 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Pending attendance adjustments must be reviewed before submission.",
          pendingAdjustments,
        });
      }

      const userName =
        getUserName(req.user);

      const previousStatus =
        attendancePeriod.status;

      attendancePeriod.status =
        "Submitted";

      attendancePeriod.submittedBy =
        userName;

      attendancePeriod.submittedAt =
        new Date();

      attendancePeriod.updatedBy =
        userName;

      attendancePeriod.workflowHistory.push({
        fromStatus: previousStatus,
        toStatus: "Submitted",
        action:
          "Attendance period submitted",
        notes:
          normalizeString(
            req.body?.notes
          ) ||
          "Attendance period submitted for manager review.",
        performedBy: userName,
        performedAt: new Date(),
      });

      await attendancePeriod.save();

      await writeAuditLog({
        req,
        action:
          "SUBMIT_ATTENDANCE_PERIOD",
        module: "HR",
        description:
          `Attendance period ${periodNumber} submitted for manager review`,
        targetType:
          "AttendancePeriod",
        targetId: periodNumber,
        beforeValues: {
          status: previousStatus,
        },
        afterValues:
          buildSafeAttendanceAuditSnapshot(
            attendancePeriod
          ),
        metadata: {
          employeeId:
            attendancePeriod.employeeId,
          periodKey:
            attendancePeriod.periodKey,
          submittedBy: userName,
        },
      });

      return res.json({
        success: true,
        message:
          `${periodNumber} submitted successfully.`,
        data: attendancePeriod,
      });
    } catch (error) {
      console.error(
        "Attendance period submission error:",
        error
      );

      if (
        error?.name ===
        "ValidationError"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Attendance period submission validation failed.",
          error: error.message,
        });
      }

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not submit attendance period.",
      });
    }
  };

  const approveAttendancePeriodByManager =
  async (req, res) => {
    try {
      const periodNumber =
        normalizeString(
          req.params.periodNumber
        );

      const attendancePeriod =
        await AttendancePeriod.findOne({
          periodNumber,
        });

      if (!attendancePeriod) {
        return res.status(404).json({
          success: false,
          message:
            "Attendance period was not found.",
        });
      }

      if (
        attendancePeriod.status !==
        "Submitted"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${periodNumber} must have Submitted status before manager approval.`,
          data: {
            periodNumber,
            currentStatus:
              attendancePeriod.status,
            requiredStatus:
              "Submitted",
          },
        });
      }

      const approvalNotes =
        normalizeString(
          req.body?.approvalNotes
        );

      if (!approvalNotes) {
        return res.status(400).json({
          success: false,
          message:
            "Manager approval notes are required.",
        });
      }

      const pendingAdjustments =
        attendancePeriod.adjustments
          .filter(
            (adjustment) =>
              adjustment.status ===
              "Pending"
          )
          .map(
            (adjustment) =>
              adjustment
                .adjustmentNumber
          );

      if (
        pendingAdjustments.length > 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Pending attendance adjustments must be resolved before manager approval.",
          pendingAdjustments,
        });
      }

      const incompleteDates =
        attendancePeriod.dailyEntries
          .filter(
            (entry) =>
              entry.dayStatus ===
              "Incomplete"
          )
          .map(
            (entry) =>
              entry.workDate
          );

      if (
        incompleteDates.length > 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Incomplete attendance dates must be resolved before manager approval.",
          invalidDates:
            incompleteDates,
        });
      }

      const userName =
        getUserName(req.user);

      const previousStatus =
        attendancePeriod.status;

      attendancePeriod.status =
        "Manager Approved";

      attendancePeriod.managerApprovedBy =
        userName;

      attendancePeriod.managerApprovedAt =
        new Date();

      attendancePeriod.managerApprovalNotes =
        approvalNotes;

      attendancePeriod.updatedBy =
        userName;

      attendancePeriod.workflowHistory.push({
        fromStatus: previousStatus,
        toStatus:
          "Manager Approved",
        action:
          "Attendance period manager approval",
        notes: approvalNotes,
        performedBy: userName,
        performedAt: new Date(),
      });

      await attendancePeriod.save();

      await writeAuditLog({
        req,
        action:
          "MANAGER_APPROVE_ATTENDANCE_PERIOD",
        module: "HR",
        description:
          `Attendance period ${periodNumber} approved by manager`,
        targetType:
          "AttendancePeriod",
        targetId: periodNumber,
        beforeValues: {
          status: previousStatus,
        },
        afterValues:
          buildSafeAttendanceAuditSnapshot(
            attendancePeriod
          ),
        metadata: {
          employeeId:
            attendancePeriod.employeeId,
          periodKey:
            attendancePeriod.periodKey,
          managerApprovedBy:
            userName,
          exceptionDayCount:
            attendancePeriod.dailyEntries
              .filter(
                (entry) =>
                  Boolean(
                    normalizeString(
                      entry.exceptionNotes
                    )
                  )
              ).length,
        },
      });

      return res.json({
        success: true,
        message:
          `${periodNumber} manager-approved successfully.`,
        data: attendancePeriod,
      });
    } catch (error) {
      console.error(
        "Attendance period manager approval error:",
        error
      );

      if (
        error?.name ===
        "ValidationError"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Attendance period manager approval validation failed.",
          error: error.message,
        });
      }

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not approve attendance period.",
      });
    }
  };

  const markAttendancePeriodPayrollReady =
  async (req, res) => {
    try {
      const periodNumber =
        normalizeString(
          req.params.periodNumber
        );

      const attendancePeriod =
        await AttendancePeriod.findOne({
          periodNumber,
        });

      if (!attendancePeriod) {
        return res.status(404).json({
          success: false,
          message:
            "Attendance period was not found.",
        });
      }

      if (
        attendancePeriod.status !==
        "Manager Approved"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${periodNumber} must have Manager Approved status before it can become Payroll Ready.`,
          data: {
            periodNumber,
            currentStatus:
              attendancePeriod.status,
            requiredStatus:
              "Manager Approved",
          },
        });
      }

      if (
        !attendancePeriod
          .managerApprovedAt
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Manager approval evidence is missing from this attendance period.",
        });
      }

      const today =
        getJamaicaTodayYmd();

      if (
        attendancePeriod.periodEnd >
        today
      ) {
        return res.status(409).json({
          success: false,
          message:
            "An attendance period cannot become Payroll Ready before its period end date.",
          data: {
            periodEnd:
              attendancePeriod.periodEnd,
            currentDate: today,
          },
        });
      }

      const unassessedDates =
        attendancePeriod.dailyEntries
          .filter(
            (entry) =>
              entry.scheduledWorkday ===
                true &&
              [
                "No Record",
                "Incomplete",
              ].includes(
                entry.dayStatus
              )
          )
          .map(
            (entry) =>
              entry.workDate
          );

      if (
        unassessedDates.length > 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "All scheduled dates must be assessed before the attendance period can become Payroll Ready.",
          invalidDates:
            unassessedDates,
        });
      }

      const pendingAdjustments =
        attendancePeriod.adjustments
          .filter(
            (adjustment) =>
              adjustment.status ===
              "Pending"
          )
          .map(
            (adjustment) =>
              adjustment
                .adjustmentNumber
          );

      if (
        pendingAdjustments.length > 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Pending attendance adjustments must be resolved before the period can become Payroll Ready.",
          pendingAdjustments,
        });
      }

      if (
        attendancePeriod
          .employeeSnapshot
          ?.payrollEnabled !== true
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Payroll is not enabled for this employee.",
        });
      }

      if (
        attendancePeriod
          .employeeSnapshot
          ?.payrollEligibilityStatus !==
        "Eligible"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "The employee must have Eligible payroll status before attendance can become Payroll Ready.",
          data: {
            employeeId:
              attendancePeriod.employeeId,
            payrollEligibilityStatus:
              attendancePeriod
                .employeeSnapshot
                ?.payrollEligibilityStatus ||
              "",
            requiredStatus:
              "Eligible",
          },
        });
      }

      const readinessNotes =
        normalizeString(
          req.body?.readinessNotes
        );

      if (!readinessNotes) {
        return res.status(400).json({
          success: false,
          message:
            "Payroll-readiness notes are required.",
        });
      }

      const userName =
        getUserName(req.user);

      const previousStatus =
        attendancePeriod.status;

      attendancePeriod.status =
        "Payroll Ready";

      attendancePeriod.payrollReadyBy =
        userName;

      attendancePeriod.payrollReadyAt =
        new Date();

      attendancePeriod.payrollReadinessNotes =
        readinessNotes;

      attendancePeriod.updatedBy =
        userName;

      attendancePeriod.workflowHistory.push({
        fromStatus: previousStatus,
        toStatus: "Payroll Ready",
        action:
          "Attendance period marked Payroll Ready",
        notes: readinessNotes,
        performedBy: userName,
        performedAt: new Date(),
      });

      await attendancePeriod.save();

      await writeAuditLog({
        req,
        action:
          "MARK_ATTENDANCE_PERIOD_PAYROLL_READY",
        module: "HR",
        description:
          `Attendance period ${periodNumber} marked Payroll Ready`,
        targetType:
          "AttendancePeriod",
        targetId: periodNumber,
        beforeValues: {
          status: previousStatus,
        },
        afterValues:
          buildSafeAttendanceAuditSnapshot(
            attendancePeriod
          ),
        metadata: {
          employeeId:
            attendancePeriod.employeeId,
          periodKey:
            attendancePeriod.periodKey,
          payrollReadyBy: userName,
          payrollEligibilityStatus:
            attendancePeriod
              .employeeSnapshot
              ?.payrollEligibilityStatus,
        },
      });

      return res.json({
        success: true,
        message:
          `${periodNumber} marked Payroll Ready successfully.`,
        data: attendancePeriod,
      });
    } catch (error) {
      console.error(
        "Attendance period Payroll Ready error:",
        error
      );

      if (
        error?.name ===
        "ValidationError"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Attendance period Payroll Ready validation failed.",
          error: error.message,
        });
      }

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not mark attendance period Payroll Ready.",
      });
    }
  };

module.exports = {
  getAttendancePeriods,
  previewAttendancePeriod,
  createAttendancePeriodDraft,
  refreshAttendancePeriodDraft,
  requestAttendanceAdjustment,
  reviewAttendanceAdjustment,
  reopenAttendancePeriod,
  lockAttendancePeriod,
  submitAttendancePeriod,
  approveAttendancePeriodByManager,
  markAttendancePeriodPayrollReady,
};