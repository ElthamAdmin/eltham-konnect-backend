const HREmployee = require(
  "../models/HREmployee"
);
const AttendanceLog = require(
  "../models/AttendanceLog"
);
const LeaveRequest = require(
  "../models/LeaveRequest"
);

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const TIME_PATTERN =
  /^([01]\d|2[0-3]):[0-5]\d$/;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const isValidYmdDate = (value) => {
  const text = String(
    value || ""
  ).trim();

  if (!YMD_PATTERN.test(text)) {
    return false;
  }

  const date = new Date(
    `${text}T12:00:00.000Z`
  );

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) ===
      text
  );
};

const roundMinutes = (value) =>
  Math.max(
    0,
    Math.round(Number(value || 0))
  );

const getDateRange = (
  periodStart,
  periodEnd
) => {
  if (
    !isValidYmdDate(periodStart) ||
    !isValidYmdDate(periodEnd)
  ) {
    throw new Error(
      "Attendance period dates must use valid YYYY-MM-DD values."
    );
  }

  if (periodEnd < periodStart) {
    throw new Error(
      "Attendance period end date cannot be earlier than its start date."
    );
  }

  const start = new Date(
    `${periodStart}T12:00:00.000Z`
  );
  const end = new Date(
    `${periodEnd}T12:00:00.000Z`
  );

  const dates = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(
      cursor.toISOString().slice(0, 10)
    );

    cursor.setUTCDate(
      cursor.getUTCDate() + 1
    );

    if (dates.length > 62) {
      throw new Error(
        "An attendance period cannot exceed 62 calendar days."
      );
    }
  }

  return dates;
};

const buildScheduledDateTime = (
  workDate,
  time
) => {
  if (!time) {
    return null;
  }

  /*
   * Jamaica remains UTC-05:00 and does not observe
   * daylight-saving time.
   */
  return new Date(
    `${workDate}T${time}:00-05:00`
  );
};

const normalizePublicHolidays = (
  publicHolidays = []
) => {
  if (!Array.isArray(publicHolidays)) {
    throw new Error(
      "Public holidays must be supplied as an array."
    );
  }

  const holidayMap = new Map();

  for (const holiday of publicHolidays) {
    const date = String(
      holiday?.date || ""
    ).trim();

    const name = String(
      holiday?.name || ""
    ).trim();

    if (!isValidYmdDate(date)) {
      throw new Error(
        "Every public holiday must contain a valid YYYY-MM-DD date."
      );
    }

    if (!name) {
      throw new Error(
        `A public-holiday name is required for ${date}.`
      );
    }

    if (holidayMap.has(date)) {
      throw new Error(
        `Duplicate public holiday date ${date}.`
      );
    }

    holidayMap.set(date, {
      date,
      name,
    });
  }

  return holidayMap;
};

const sumTotals = (
  dailyEntries
) => {
  const totals = {
    scheduledMinutes: 0,
    sourceWorkedMinutes: 0,
    approvedAdjustmentMinutes: 0,
    payableWorkedMinutes: 0,
    regularMinutes: 0,
    lateMinutes: 0,
    absenceMinutes: 0,
    overtimeMinutes: 0,
    restDayMinutes: 0,
    publicHolidayMinutes: 0,
    scheduledDayCount: 0,
    presentDayCount: 0,
    absentDayCount: 0,
    leaveDayCount: 0,
    incompleteDayCount: 0,
  };

  for (const day of dailyEntries) {
    totals.scheduledMinutes +=
      Number(day.scheduledMinutes || 0);

    totals.sourceWorkedMinutes +=
      Number(
        day.sourceWorkedMinutes || 0
      );

    totals.approvedAdjustmentMinutes +=
      Number(
        day.approvedAdjustmentMinutes || 0
      );

    totals.payableWorkedMinutes +=
      Number(
        day.payableWorkedMinutes || 0
      );

    totals.regularMinutes +=
      Number(day.regularMinutes || 0);

    totals.lateMinutes +=
      Number(day.lateMinutes || 0);

    totals.absenceMinutes +=
      Number(day.absenceMinutes || 0);

    totals.overtimeMinutes +=
      Number(day.overtimeMinutes || 0);

    totals.restDayMinutes +=
      Number(day.restDayMinutes || 0);

    totals.publicHolidayMinutes +=
      Number(
        day.publicHolidayMinutes || 0
      );

    if (day.scheduledWorkday) {
      totals.scheduledDayCount += 1;
    }

    if (day.dayStatus === "Present") {
      totals.presentDayCount += 1;
    }

    if (day.dayStatus === "Absent") {
      totals.absentDayCount += 1;
    }

    if (
      day.dayStatus ===
      "Approved Leave"
    ) {
      totals.leaveDayCount += 1;
    }

    if (
      day.dayStatus === "Incomplete"
    ) {
      totals.incompleteDayCount += 1;
    }
  }

  return totals;
};

const buildAttendancePeriodPreview =
  async ({
    employeeId,
    periodKey,
    periodStart,
    periodEnd,
    defaultStartTime = "",
    defaultEndTime = "",
    lateGraceMinutes = 0,
    publicHolidays = [],
  }) => {
    const normalizedEmployeeId =
      String(employeeId || "").trim();

    if (!normalizedEmployeeId) {
      throw new Error(
        "Employee ID is required."
      );
    }

    const employee =
      await HREmployee.findOne({
        employeeId:
          normalizedEmployeeId,
      });

    if (!employee) {
      throw new Error(
        "Selected HR employee was not found."
      );
    }

    if (
      employee.employmentStatus !==
      "Active"
    ) {
      throw new Error(
        "Attendance periods can only be generated for Active employees."
      );
    }

    if (
      employee.attendanceRequired ===
      false
    ) {
      throw new Error(
        "Attendance tracking is disabled for this employee."
      );
    }

    if (!employee.linkedUserId) {
      throw new Error(
        "The employee must be linked to a system user before attendance can be generated."
      );
    }

    const scheduledWorkdays =
      Array.from(
        new Set(
          employee.scheduledWorkdays ||
            []
        )
      );

    const normalHoursPerDay =
      Number(
        employee.normalWorkingHours
          ?.hoursPerDay || 0
      );

    const normalHoursPerWeek =
      Number(
        employee.normalWorkingHours
          ?.hoursPerWeek || 0
      );

    if (
      scheduledWorkdays.length === 0
    ) {
      throw new Error(
        "The employee master does not contain scheduled workdays."
      );
    }

    if (normalHoursPerDay <= 0) {
      throw new Error(
        "The employee master does not contain valid normal hours per day."
      );
    }

    const normalizedStartTime =
      String(
        defaultStartTime || ""
      ).trim();

    const normalizedEndTime =
      String(
        defaultEndTime || ""
      ).trim();

    if (
      normalizedStartTime &&
      !TIME_PATTERN.test(
        normalizedStartTime
      )
    ) {
      throw new Error(
        "Default start time must use HH:mm format."
      );
    }

    if (
      normalizedEndTime &&
      !TIME_PATTERN.test(
        normalizedEndTime
      )
    ) {
      throw new Error(
        "Default end time must use HH:mm format."
      );
    }

    const safeLateGraceMinutes =
      Math.max(
        0,
        Math.min(
          240,
          Math.round(
            Number(
              lateGraceMinutes || 0
            )
          )
        )
      );

    const dates = getDateRange(
      periodStart,
      periodEnd
    );

    const holidayMap =
      normalizePublicHolidays(
        publicHolidays
      );

    const attendanceLogs =
      await AttendanceLog.find({
        userId: employee.linkedUserId,
        workDate: {
          $gte: periodStart,
          $lte: periodEnd,
        },
      }).sort({
        workDate: 1,
        createdAt: 1,
      });

    const approvedLeaves =
      await LeaveRequest.find({
        employeeId:
          employee.employeeId,
        status: "Approved",
        startDate: {
          $lte: periodEnd,
        },
        endDate: {
          $gte: periodStart,
        },
      }).sort({
        startDate: 1,
      });

    const logsByDate = new Map();

    for (const log of attendanceLogs) {
      if (
        !logsByDate.has(log.workDate)
      ) {
        logsByDate.set(
          log.workDate,
          []
        );
      }

      logsByDate
        .get(log.workDate)
        .push(log);
    }

    const findLeaveForDate = (
      workDate
    ) =>
      approvedLeaves.find(
        (leave) =>
          leave.startDate <= workDate &&
          leave.endDate >= workDate
      ) || null;

    const scheduledMinutesPerDay =
      roundMinutes(
        normalHoursPerDay * 60
      );

    const dailyEntries = [];

    for (const workDate of dates) {
      const date = new Date(
        `${workDate}T12:00:00.000Z`
      );

      const dayName =
        DAY_NAMES[date.getUTCDay()];

      const scheduledWorkday =
        scheduledWorkdays.includes(
          dayName
        );

      const restDay =
        !scheduledWorkday;

      const holiday =
        holidayMap.get(workDate) ||
        null;

      const leave =
        findLeaveForDate(workDate);

      const dayLogs =
        logsByDate.get(workDate) ||
        [];

      const completedLogs =
        dayLogs.filter(
          (log) =>
            log.sessionStatus ===
              "Completed" &&
            log.clockInTime &&
            log.clockOutTime
        );

      const sourceWorkedMinutes =
        completedLogs.reduce(
          (total, log) =>
            total +
            roundMinutes(
              log.workedMinutes
            ),
          0
        );

      const sourceLunchMinutes =
        dayLogs.reduce(
          (total, log) =>
            total +
            roundMinutes(
              log.lunchMinutes
            ),
          0
        );

      const firstLog =
        dayLogs[0] || null;

      const lastLog =
        dayLogs[
          dayLogs.length - 1
        ] || null;

      let dayStatus = "No Record";
      let regularMinutes = 0;
      let lateMinutes = 0;
      let absenceMinutes = 0;
      let overtimeMinutes = 0;
      let restDayMinutes = 0;
      let publicHolidayMinutes = 0;

      const exceptionNotes = [];

      if (dayLogs.length > 1) {
        exceptionNotes.push(
          `${dayLogs.length} raw attendance logs exist for this work date and require manager review.`
        );
      }

      if (
        dayLogs.length > 0 &&
        completedLogs.length !==
          dayLogs.length
      ) {
        exceptionNotes.push(
          "One or more raw attendance sessions are incomplete."
        );
      }

      if (
        leave &&
        dayLogs.length > 0
      ) {
        exceptionNotes.push(
          "Attendance was recorded during an approved leave period."
        );
      }

      if (holiday) {
        if (sourceWorkedMinutes > 0) {
          dayStatus = "Present";
          publicHolidayMinutes =
            sourceWorkedMinutes;
        } else {
          dayStatus =
            "Public Holiday";
        }
      } else if (restDay) {
        if (sourceWorkedMinutes > 0) {
          dayStatus = "Present";
          restDayMinutes =
            sourceWorkedMinutes;
        } else {
          dayStatus = "Rest Day";
        }
      } else if (leave) {
        dayStatus =
          dayLogs.length > 0
            ? "Incomplete"
            : "Approved Leave";
      } else if (
        dayLogs.length === 0
      ) {
        dayStatus = "Absent";
        absenceMinutes =
          scheduledMinutesPerDay;
      } else if (
        completedLogs.length !==
          dayLogs.length ||
        dayLogs.length > 1
      ) {
        dayStatus = "Incomplete";
      } else {
        dayStatus = "Present";

        regularMinutes = Math.min(
          sourceWorkedMinutes,
          scheduledMinutesPerDay
        );

        overtimeMinutes = Math.max(
          0,
          sourceWorkedMinutes -
            scheduledMinutesPerDay
        );
      }

      if (
        scheduledWorkday &&
        firstLog?.clockInTime &&
        normalizedStartTime
      ) {
        const scheduledStart =
          buildScheduledDateTime(
            workDate,
            normalizedStartTime
          );

        const actualClockIn =
          new Date(
            firstLog.clockInTime
          );

        const rawLateMinutes =
          Math.floor(
            (
              actualClockIn.getTime() -
              scheduledStart.getTime()
            ) /
              60000
          ) -
          safeLateGraceMinutes;

        lateMinutes = Math.max(
          0,
          rawLateMinutes
        );
      } else if (
        scheduledWorkday &&
        firstLog?.clockInTime &&
        !normalizedStartTime
      ) {
        exceptionNotes.push(
          "Lateness was not assessed because no scheduled start time was supplied."
        );
      }

      dailyEntries.push({
        workDate,
        dayName,
        dayStatus,
        scheduledWorkday,
        restDay,
        publicHoliday:
          Boolean(holiday),
        publicHolidayName:
          holiday?.name || "",
        approvedLeave:
          Boolean(leave),
        leaveRequestNumber:
          leave?.leaveRequestId || "",
        scheduledStartTime:
          scheduledWorkday
            ? normalizedStartTime
            : "",
        scheduledEndTime:
          scheduledWorkday
            ? normalizedEndTime
            : "",
        scheduledMinutes:
          scheduledWorkday
            ? scheduledMinutesPerDay
            : 0,
        attendanceNumber:
          dayLogs
            .map(
              (log) =>
                log.attendanceNumber
            )
            .join(", "),
        clockInTime:
          firstLog?.clockInTime ||
          null,
        lunchOutTime:
          firstLog?.lunchOutTime ||
          null,
        lunchInTime:
          lastLog?.lunchInTime ||
          null,
        clockOutTime:
          lastLog?.clockOutTime ||
          null,
        lunchMinutes:
          sourceLunchMinutes,
        sourceWorkedMinutes,
        approvedAdjustmentMinutes: 0,
        payableWorkedMinutes:
          sourceWorkedMinutes,
        regularMinutes,
        lateMinutes,
        absenceMinutes,
        overtimeMinutes,
        restDayMinutes,
        publicHolidayMinutes,
        exceptionNotes:
          exceptionNotes.join(" "),
      });
    }

    const sourceAttendanceNumbers =
      attendanceLogs
        .map(
          (log) =>
            log.attendanceNumber
        )
        .filter(Boolean);

    return {
      employee,
      periodDraft: {
        periodNumber:
          `ATTP-${employee.employeeId}-` +
          `${periodKey}-${Date.now()}`,
        employeeId:
          employee.employeeId,
        employeeSnapshot: {
          fullName:
            employee.fullName,
          jobTitle:
            employee.jobTitle,
          department:
            employee.department,
          branch:
            employee.branch,
          employmentStatus:
            employee.employmentStatus,
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
        periodKey:
          String(periodKey || "").trim(),
        periodStart,
        periodEnd,
        scheduleSnapshot: {
          scheduledWorkdays,
          normalHoursPerDay,
          normalHoursPerWeek,
          defaultStartTime:
            normalizedStartTime,
          defaultEndTime:
            normalizedEndTime,
          lateGraceMinutes:
            safeLateGraceMinutes,
          source:
            normalizedStartTime ||
            normalizedEndTime
              ? "Manager Supplied"
              : "Employee Master",
          capturedAt: new Date(),
        },
        dailyEntries,
        adjustments: [],
        totals:
          sumTotals(dailyEntries),
        sourceAttendanceNumbers,
        status: "Draft",
      },
    };
  };

module.exports = {
  buildAttendancePeriodPreview,
  isValidYmdDate,
  sumTotals,
};