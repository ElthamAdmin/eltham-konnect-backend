const AttendancePeriod = require(
  "../models/AttendancePeriod"
);

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const normalizeText = (value) =>
  String(value || "").trim();

const isValidYmdDate = (value) => {
  const text = normalizeText(value);

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

const getJamaicaTodayYmd = () => {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "America/Jamaica",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
};

const getDefaultDateRange = () => {
  const today = getJamaicaTodayYmd();
  const yearMonth = today.slice(0, 7);

  const year = Number(
    yearMonth.slice(0, 4)
  );

  const month = Number(
    yearMonth.slice(5, 7)
  );

  const lastDay = new Date(
    Date.UTC(year, month, 0)
  )
    .toISOString()
    .slice(0, 10);

  return {
    startDate: `${yearMonth}-01`,
    endDate: lastDay,
  };
};

const roundNumber = (
  value,
  decimalPlaces = 2
) => {
  const multiplier =
    10 ** decimalPlaces;

  return (
    Math.round(
      (
        Number(value || 0) +
        Number.EPSILON
      ) * multiplier
    ) / multiplier
  );
};

const minutesToHours = (minutes) =>
  roundNumber(
    Number(minutes || 0) / 60
  );

const formatMinutes = (minutes) => {
  const safeMinutes = Math.max(
    0,
    Math.round(Number(minutes || 0))
  );

  const hours =
    Math.floor(safeMinutes / 60);

  const remainingMinutes =
    safeMinutes % 60;

  return `${hours}h ${remainingMinutes}m`;
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

const objectToBreakdown = (
  values = {}
) =>
  Object.entries(values)
    .map(([label, count]) => ({
      label,
      count,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.label.localeCompare(
          right.label
        )
    );

const buildEmployeeKey = (
  period
) =>
  normalizeText(period.employeeId) ||
  normalizeText(
    period.employeeSnapshot
      ?.linkedUserId
  ) ||
  normalizeText(period.periodNumber);

const getAttendanceAndLatenessReport =
  async (req, res) => {
    try {
      const defaults =
        getDefaultDateRange();

      const startDate =
        normalizeText(
          req.query.startDate
        ) || defaults.startDate;

      const endDate =
        normalizeText(
          req.query.endDate
        ) || defaults.endDate;

      if (
        !isValidYmdDate(startDate) ||
        !isValidYmdDate(endDate)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Attendance report dates must use valid YYYY-MM-DD values.",
        });
      }

      if (endDate < startDate) {
        return res.status(400).json({
          success: false,
          message:
            "Attendance report end date cannot be earlier than its start date.",
        });
      }

      const filters = {
        startDate,
        endDate,
        employeeId:
          normalizeText(
            req.query.employeeId
          ),
        department:
          normalizeText(
            req.query.department
          ),
        branch:
          normalizeText(
            req.query.branch
          ),
        status:
          normalizeText(
            req.query.status
          ),
      };

      const databaseFilter = {
        periodStart: {
          $lte: endDate,
        },
        periodEnd: {
          $gte: startDate,
        },
      };

      if (filters.employeeId) {
        databaseFilter.employeeId =
          filters.employeeId;
      }

      if (filters.department) {
        databaseFilter[
          "employeeSnapshot.department"
        ] = filters.department;
      }

      if (filters.branch) {
        databaseFilter[
          "employeeSnapshot.branch"
        ] = filters.branch;
      }

      if (filters.status) {
        databaseFilter.status =
          filters.status;
      }

      const attendancePeriods =
        await AttendancePeriod.find(
          databaseFilter
        )
          .sort({
            periodStart: 1,
            employeeId: 1,
          })
          .lean();

      const totals = {
        scheduledMinutes: 0,
        sourceWorkedMinutes: 0,
        payablePhysicalWorkedMinutes: 0,
        payableLeaveMinutes: 0,
        approvedAdjustmentMinutes: 0,
        payableWorkedMinutes: 0,
        regularMinutes: 0,
        lateMinutes: 0,
        absenceMinutes: 0,
        overtimeMinutes: 0,
        restDayMinutes: 0,
        publicHolidayMinutes: 0,
        scheduledDays: 0,
        presentDays: 0,
        absentDays: 0,
        approvedLeaveDays: 0,
        incompleteDays: 0,
        exceptionDays: 0,
        lateDays: 0,
        overtimeDays: 0,
        pendingAdjustments: 0,
        approvedAdjustments: 0,
        rejectedAdjustments: 0,
      };

      const periodStatusCounts = {};
      const dayStatusCounts = {};
      const departmentCounts = {};
      const branchCounts = {};
      const employeeMap = new Map();
      const dailyMap = new Map();

      for (
        const period of
        attendancePeriods
      ) {
        incrementCount(
          periodStatusCounts,
          period.status
        );

        incrementCount(
          departmentCounts,
          period.employeeSnapshot
            ?.department
        );

        incrementCount(
          branchCounts,
          period.employeeSnapshot
            ?.branch
        );

        const employeeKey =
          buildEmployeeKey(period);

        if (!employeeMap.has(employeeKey)) {
          employeeMap.set(
            employeeKey,
            {
              employeeId:
                normalizeText(
                  period.employeeId
                ),
              fullName:
                normalizeText(
                  period.employeeSnapshot
                    ?.fullName
                ),
              jobTitle:
                normalizeText(
                  period.employeeSnapshot
                    ?.jobTitle
                ),
              department:
                normalizeText(
                  period.employeeSnapshot
                    ?.department
                ),
              branch:
                normalizeText(
                  period.employeeSnapshot
                    ?.branch
                ),
              periodNumbers:
                new Set(),
              scheduledMinutes: 0,
              sourceWorkedMinutes: 0,
              payableMinutes: 0,
              lateMinutes: 0,
              absenceMinutes: 0,
              overtimeMinutes: 0,
              restDayMinutes: 0,
              publicHolidayMinutes: 0,
              scheduledDays: 0,
              presentDays: 0,
              absentDays: 0,
              approvedLeaveDays: 0,
              incompleteDays: 0,
              exceptionDays: 0,
              lateDays: 0,
            }
          );
        }

        const employee =
          employeeMap.get(employeeKey);

        employee.periodNumbers.add(
          period.periodNumber
        );

        for (
          const adjustment of
            period.adjustments || []
        ) {
          const workDate =
            normalizeText(
              adjustment.workDate
            );

          if (
            workDate < startDate ||
            workDate > endDate
          ) {
            continue;
          }

          if (
            adjustment.status ===
            "Pending"
          ) {
            totals.pendingAdjustments += 1;
          }

          if (
            adjustment.status ===
            "Approved"
          ) {
            totals.approvedAdjustments += 1;
          }

          if (
            adjustment.status ===
            "Rejected"
          ) {
            totals.rejectedAdjustments += 1;
          }
        }

        for (
          const entry of
            period.dailyEntries || []
        ) {
          const workDate =
            normalizeText(
              entry.workDate
            );

          if (
            workDate < startDate ||
            workDate > endDate
          ) {
            continue;
          }

          const scheduledMinutes =
            Number(
              entry.scheduledMinutes ||
                0
            );

          const sourceWorkedMinutes =
            Number(
              entry.sourceWorkedMinutes ||
                0
            );

          const physicalMinutes =
            Number(
              entry
                .payablePhysicalWorkedMinutes ||
                0
            );

          const leaveMinutes =
            Number(
              entry.leavePayableMinutes ||
                0
            );

          const adjustmentMinutes =
            Number(
              entry
                .approvedAdjustmentMinutes ||
                0
            );

          const payableMinutes =
            Number(
              entry.payableWorkedMinutes ||
                0
            );

          const regularMinutes =
            Number(
              entry.regularMinutes || 0
            );

          const lateMinutes =
            Number(
              entry.lateMinutes || 0
            );

          const absenceMinutes =
            Number(
              entry.absenceMinutes || 0
            );

          const overtimeMinutes =
            Number(
              entry.overtimeMinutes ||
                0
            );

          const restDayMinutes =
            Number(
              entry.restDayMinutes || 0
            );

          const holidayMinutes =
            Number(
              entry.publicHolidayMinutes ||
                0
            );

          const hasException =
            entry.dayStatus ===
              "Incomplete" ||
            Boolean(
              normalizeText(
                entry.exceptionNotes
              )
            );

          totals.scheduledMinutes +=
            scheduledMinutes;

          totals.sourceWorkedMinutes +=
            sourceWorkedMinutes;

          totals.payablePhysicalWorkedMinutes +=
            physicalMinutes;

          totals.payableLeaveMinutes +=
            leaveMinutes;

          totals.approvedAdjustmentMinutes +=
            adjustmentMinutes;

          totals.payableWorkedMinutes +=
            payableMinutes;

          totals.regularMinutes +=
            regularMinutes;

          totals.lateMinutes +=
            lateMinutes;

          totals.absenceMinutes +=
            absenceMinutes;

          totals.overtimeMinutes +=
            overtimeMinutes;

          totals.restDayMinutes +=
            restDayMinutes;

          totals.publicHolidayMinutes +=
            holidayMinutes;

          if (entry.scheduledWorkday) {
            totals.scheduledDays += 1;
            employee.scheduledDays += 1;
          }

          if (
            entry.dayStatus === "Present"
          ) {
            totals.presentDays += 1;
            employee.presentDays += 1;
          }

          if (
            entry.dayStatus === "Absent"
          ) {
            totals.absentDays += 1;
            employee.absentDays += 1;
          }

          if (
            entry.approvedLeave &&
            entry.scheduledWorkday
          ) {
            totals.approvedLeaveDays += 1;
            employee.approvedLeaveDays += 1;
          }

          if (
            entry.dayStatus ===
            "Incomplete"
          ) {
            totals.incompleteDays += 1;
            employee.incompleteDays += 1;
          }

          if (hasException) {
            totals.exceptionDays += 1;
            employee.exceptionDays += 1;
          }

          if (lateMinutes > 0) {
            totals.lateDays += 1;
            employee.lateDays += 1;
          }

          if (overtimeMinutes > 0) {
            totals.overtimeDays += 1;
          }

          incrementCount(
            dayStatusCounts,
            entry.dayStatus
          );

          employee.scheduledMinutes +=
            scheduledMinutes;

          employee.sourceWorkedMinutes +=
            sourceWorkedMinutes;

          employee.payableMinutes +=
            payableMinutes;

          employee.lateMinutes +=
            lateMinutes;

          employee.absenceMinutes +=
            absenceMinutes;

          employee.overtimeMinutes +=
            overtimeMinutes;

          employee.restDayMinutes +=
            restDayMinutes;

          employee.publicHolidayMinutes +=
            holidayMinutes;

          if (!dailyMap.has(workDate)) {
            dailyMap.set(workDate, {
              workDate,
              scheduledMinutes: 0,
              payableMinutes: 0,
              lateMinutes: 0,
              absenceMinutes: 0,
              overtimeMinutes: 0,
              presentEmployees: 0,
              absentEmployees: 0,
              exceptionEmployees: 0,
            });
          }

          const day =
            dailyMap.get(workDate);

          day.scheduledMinutes +=
            scheduledMinutes;

          day.payableMinutes +=
            payableMinutes;

          day.lateMinutes +=
            lateMinutes;

          day.absenceMinutes +=
            absenceMinutes;

          day.overtimeMinutes +=
            overtimeMinutes;

          if (
            entry.dayStatus === "Present"
          ) {
            day.presentEmployees += 1;
          }

          if (
            entry.dayStatus === "Absent"
          ) {
            day.absentEmployees += 1;
          }

          if (hasException) {
            day.exceptionEmployees += 1;
          }
        }
      }

      const employeeRegister =
        Array.from(employeeMap.values())
          .map((employee) => ({
            ...employee,
            periodNumbers:
              Array.from(
                employee.periodNumbers
              ),
            scheduledHours:
              minutesToHours(
                employee.scheduledMinutes
              ),
            sourceWorkedHours:
              minutesToHours(
                employee.sourceWorkedMinutes
              ),
            payableHours:
              minutesToHours(
                employee.payableMinutes
              ),
            lateHours:
              minutesToHours(
                employee.lateMinutes
              ),
            absenceHours:
              minutesToHours(
                employee.absenceMinutes
              ),
            overtimeHours:
              minutesToHours(
                employee.overtimeMinutes
              ),
            restDayHours:
              minutesToHours(
                employee.restDayMinutes
              ),
            publicHolidayHours:
              minutesToHours(
                employee.publicHolidayMinutes
              ),
            attendanceRate:
              employee.scheduledDays > 0
                ? roundNumber(
                    (
                      employee.presentDays /
                      employee.scheduledDays
                    ) * 100
                  )
                : 0,
          }))
          .sort(
            (left, right) =>
              right.lateMinutes -
                left.lateMinutes ||
              right.absenceMinutes -
                left.absenceMinutes ||
              left.fullName.localeCompare(
                right.fullName
              )
          );

      const dailyTrend =
        Array.from(dailyMap.values())
          .map((day) => ({
            ...day,
            scheduledHours:
              minutesToHours(
                day.scheduledMinutes
              ),
            payableHours:
              minutesToHours(
                day.payableMinutes
              ),
            lateHours:
              minutesToHours(
                day.lateMinutes
              ),
            absenceHours:
              minutesToHours(
                day.absenceMinutes
              ),
            overtimeHours:
              minutesToHours(
                day.overtimeMinutes
              ),
          }))
          .sort((left, right) =>
            left.workDate.localeCompare(
              right.workDate
            )
          );

      const totalEmployees =
        employeeRegister.length;

      const summary = {
        totalPeriods:
          attendancePeriods.length,
        totalEmployees,
        ...totals,
        scheduledHours:
          minutesToHours(
            totals.scheduledMinutes
          ),
        sourceWorkedHours:
          minutesToHours(
            totals.sourceWorkedMinutes
          ),
        payablePhysicalWorkedHours:
          minutesToHours(
            totals
              .payablePhysicalWorkedMinutes
          ),
        payableLeaveHours:
          minutesToHours(
            totals.payableLeaveMinutes
          ),
        approvedAdjustmentHours:
          minutesToHours(
            totals
              .approvedAdjustmentMinutes
          ),
        payableHours:
          minutesToHours(
            totals.payableWorkedMinutes
          ),
        regularHours:
          minutesToHours(
            totals.regularMinutes
          ),
        lateHours:
          minutesToHours(
            totals.lateMinutes
          ),
        absenceHours:
          minutesToHours(
            totals.absenceMinutes
          ),
        overtimeHours:
          minutesToHours(
            totals.overtimeMinutes
          ),
        restDayHours:
          minutesToHours(
            totals.restDayMinutes
          ),
        publicHolidayHours:
          minutesToHours(
            totals.publicHolidayMinutes
          ),
        attendanceRate:
          totals.scheduledDays > 0
            ? roundNumber(
                (
                  totals.presentDays /
                  totals.scheduledDays
                ) * 100
              )
            : 0,
        latenessRate:
          totals.scheduledDays > 0
            ? roundNumber(
                (
                  totals.lateDays /
                  totals.scheduledDays
                ) * 100
              )
            : 0,
        absenceRate:
          totals.scheduledDays > 0
            ? roundNumber(
                (
                  totals.absentDays /
                  totals.scheduledDays
                ) * 100
              )
            : 0,
      };

      return res.json({
        success: true,
        message:
          "Attendance and lateness report generated successfully.",
        generatedAt: new Date(),
        filters,
        summary,
        breakdowns: {
          byPeriodStatus:
            objectToBreakdown(
              periodStatusCounts
            ),
          byDayStatus:
            objectToBreakdown(
              dayStatusCounts
            ),
          byDepartment:
            objectToBreakdown(
              departmentCounts
            ),
          byBranch:
            objectToBreakdown(
              branchCounts
            ),
        },
        employeeRegister,
        dailyTrend,
      });
    } catch (error) {
      console.error(
        "Attendance and lateness report error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to generate the attendance and lateness report.",
        error: error.message,
      });
    }
  };

module.exports = {
  getAttendanceAndLatenessReport,
};