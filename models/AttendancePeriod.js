const mongoose = require("mongoose");

const WORKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const PERIOD_STATUSES = [
  "Draft",
  "Submitted",
  "Manager Approved",
  "Payroll Ready",
  "Reopened",
  "Locked",
  "Cancelled",
];

const DAY_STATUSES = [
  "Present",
  "Absent",
  "Approved Leave",
  "Rest Day",
  "Public Holiday",
  "Incomplete",
  "No Record",
];

const ADJUSTMENT_TYPES = [
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

const ADJUSTMENT_STATUSES = [
  "Pending",
  "Approved",
  "Rejected",
  "Cancelled",
];

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const TIME_PATTERN =
  /^([01]\d|2[0-3]):[0-5]\d$/;

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

const AttendancePeriodSchema =
  new mongoose.Schema(
    {
      periodNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
      },

      employeeId: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      employeeSnapshot: {
        fullName: {
          type: String,
          required: true,
          trim: true,
        },

        jobTitle: {
          type: String,
          default: "",
          trim: true,
        },

        department: {
          type: String,
          default: "",
          trim: true,
        },

        branch: {
          type: String,
          default: "",
          trim: true,
        },

        employmentStatus: {
          type: String,
          default: "",
          trim: true,
        },

        linkedUserId: {
          type: String,
          default: "",
          trim: true,
        },

        attendanceRequired: {
          type: Boolean,
          default: true,
        },

        payrollEnabled: {
          type: Boolean,
          default: false,
        },

        payrollEligibilityStatus: {
          type: String,
          default: "",
          trim: true,
        },
      },

      periodKey: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      periodStart: {
        type: String,
        required: true,
        trim: true,
      },

      periodEnd: {
        type: String,
        required: true,
        trim: true,
      },

      scheduleSnapshot: {
        scheduledWorkdays: [
          {
            type: String,
            enum: WORKDAYS,
          },
        ],

        normalHoursPerDay: {
          type: Number,
          default: 0,
          min: 0,
          max: 24,
        },

        normalHoursPerWeek: {
          type: Number,
          default: 0,
          min: 0,
          max: 168,
        },

        defaultStartTime: {
          type: String,
          default: "",
          trim: true,
        },

        defaultEndTime: {
          type: String,
          default: "",
          trim: true,
        },

        lateGraceMinutes: {
          type: Number,
          default: 0,
          min: 0,
          max: 240,
        },

        source: {
          type: String,
          enum: [
            "Employee Master",
            "Manager Supplied",
          ],
          default: "Employee Master",
        },

        capturedAt: {
          type: Date,
          default: Date.now,
        },
      },

      dailyEntries: [
        {
          workDate: {
            type: String,
            required: true,
            trim: true,
          },

          dayName: {
            type: String,
            enum: WORKDAYS,
            required: true,
          },

          dayStatus: {
            type: String,
            enum: DAY_STATUSES,
            default: "No Record",
          },

          scheduledWorkday: {
            type: Boolean,
            default: false,
          },

          restDay: {
            type: Boolean,
            default: false,
          },

          publicHoliday: {
            type: Boolean,
            default: false,
          },

          publicHolidayName: {
            type: String,
            default: "",
            trim: true,
          },

          approvedLeave: {
            type: Boolean,
            default: false,
          },

          leaveRequestNumber: {
            type: String,
            default: "",
            trim: true,
          },

          scheduledStartTime: {
            type: String,
            default: "",
            trim: true,
          },

          scheduledEndTime: {
            type: String,
            default: "",
            trim: true,
          },

          scheduledMinutes: {
            type: Number,
            default: 0,
            min: 0,
          },

          attendanceNumber: {
            type: String,
            default: "",
            trim: true,
          },

          clockInTime: {
            type: Date,
            default: null,
          },

          lunchOutTime: {
            type: Date,
            default: null,
          },

          lunchInTime: {
            type: Date,
            default: null,
          },

          clockOutTime: {
            type: Date,
            default: null,
          },

          lunchMinutes: {
            type: Number,
            default: 0,
            min: 0,
          },

          sourceWorkedMinutes: {
            type: Number,
            default: 0,
            min: 0,
          },

          approvedAdjustmentMinutes: {
            type: Number,
            default: 0,
          },

          payableWorkedMinutes: {
            type: Number,
            default: 0,
            min: 0,
          },

          regularMinutes: {
            type: Number,
            default: 0,
            min: 0,
          },

          lateMinutes: {
            type: Number,
            default: 0,
            min: 0,
          },

          absenceMinutes: {
            type: Number,
            default: 0,
            min: 0,
          },

          overtimeMinutes: {
            type: Number,
            default: 0,
            min: 0,
          },

          restDayMinutes: {
            type: Number,
            default: 0,
            min: 0,
          },

          publicHolidayMinutes: {
            type: Number,
            default: 0,
            min: 0,
          },

          exceptionNotes: {
            type: String,
            default: "",
            trim: true,
          },
        },
      ],

      adjustments: [
        {
          adjustmentNumber: {
            type: String,
            required: true,
            trim: true,
          },

          workDate: {
            type: String,
            required: true,
            trim: true,
          },

          adjustmentType: {
            type: String,
            enum: ADJUSTMENT_TYPES,
            required: true,
          },

          minutesAdjustment: {
            type: Number,
            default: 0,
          },

          reason: {
            type: String,
            required: true,
            trim: true,
          },

          supportingReference: {
            type: String,
            default: "",
            trim: true,
          },

          status: {
            type: String,
            enum: ADJUSTMENT_STATUSES,
            default: "Pending",
          },

          requestedBy: {
            type: String,
            default: "",
            trim: true,
          },

          requestedAt: {
            type: Date,
            default: Date.now,
          },

          reviewedBy: {
            type: String,
            default: "",
            trim: true,
          },

          reviewedAt: {
            type: Date,
            default: null,
          },

          reviewNotes: {
            type: String,
            default: "",
            trim: true,
          },
        },
      ],

      totals: {
        scheduledMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },

        sourceWorkedMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },

        approvedAdjustmentMinutes: {
          type: Number,
          default: 0,
        },

        payableWorkedMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },

        regularMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },

        lateMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },

        absenceMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },

        overtimeMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },

        restDayMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },

        publicHolidayMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },

        scheduledDayCount: {
          type: Number,
          default: 0,
          min: 0,
        },

        presentDayCount: {
          type: Number,
          default: 0,
          min: 0,
        },

        absentDayCount: {
          type: Number,
          default: 0,
          min: 0,
        },

        leaveDayCount: {
          type: Number,
          default: 0,
          min: 0,
        },

        incompleteDayCount: {
          type: Number,
          default: 0,
          min: 0,
        },
      },

      sourceAttendanceNumbers: [
        {
          type: String,
          trim: true,
        },
      ],

      generatedBy: {
        type: String,
        default: "",
        trim: true,
      },

      generatedAt: {
        type: Date,
        default: Date.now,
      },

      submittedBy: {
        type: String,
        default: "",
        trim: true,
      },

      submittedAt: {
        type: Date,
        default: null,
      },

      managerApprovedBy: {
        type: String,
        default: "",
        trim: true,
      },

      managerApprovedAt: {
        type: Date,
        default: null,
      },

      managerApprovalNotes: {
        type: String,
        default: "",
        trim: true,
      },

      payrollReadyBy: {
        type: String,
        default: "",
        trim: true,
      },

      payrollReadyAt: {
        type: Date,
        default: null,
      },

      payrollReadinessNotes: {
        type: String,
        default: "",
        trim: true,
      },

      payrollNumber: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      lockedBy: {
        type: String,
        default: "",
        trim: true,
      },

      lockedAt: {
        type: Date,
        default: null,
      },

      status: {
        type: String,
        enum: PERIOD_STATUSES,
        default: "Draft",
        index: true,
      },

      workflowHistory: [
        {
          fromStatus: {
            type: String,
            default: "",
          },

          toStatus: {
            type: String,
            required: true,
          },

          action: {
            type: String,
            required: true,
            trim: true,
          },

          notes: {
            type: String,
            default: "",
            trim: true,
          },

          performedBy: {
            type: String,
            default: "",
            trim: true,
          },

          performedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],

      notes: {
        type: String,
        default: "",
        trim: true,
      },

      createdBy: {
        type: String,
        default: "",
        trim: true,
      },

      updatedBy: {
        type: String,
        default: "",
        trim: true,
      },
    },
    {
      timestamps: true,
    }
  );

AttendancePeriodSchema.index(
  {
    employeeId: 1,
    periodKey: 1,
  },
  {
    unique: true,
  }
);

AttendancePeriodSchema.index({
  periodStart: 1,
  periodEnd: 1,
  status: 1,
});

AttendancePeriodSchema.pre(
  "validate",
  function validateAttendancePeriod(next) {
    if (
      !isValidYmdDate(this.periodStart) ||
      !isValidYmdDate(this.periodEnd)
    ) {
      this.invalidate(
        "periodStart",
        "Attendance period dates must use valid YYYY-MM-DD values."
      );
    } else if (
      this.periodEnd < this.periodStart
    ) {
      this.invalidate(
        "periodEnd",
        "Attendance period end date cannot be earlier than its start date."
      );
    }

    const startTime = String(
      this.scheduleSnapshot
        ?.defaultStartTime || ""
    ).trim();

    const endTime = String(
      this.scheduleSnapshot
        ?.defaultEndTime || ""
    ).trim();

    if (
      startTime &&
      !TIME_PATTERN.test(startTime)
    ) {
      this.invalidate(
        "scheduleSnapshot.defaultStartTime",
        "Default start time must use HH:mm format."
      );
    }

    if (
      endTime &&
      !TIME_PATTERN.test(endTime)
    ) {
      this.invalidate(
        "scheduleSnapshot.defaultEndTime",
        "Default end time must use HH:mm format."
      );
    }

    const scheduledWorkdays =
      this.scheduleSnapshot
        ?.scheduledWorkdays || [];

    if (
      new Set(scheduledWorkdays).size !==
      scheduledWorkdays.length
    ) {
      this.invalidate(
        "scheduleSnapshot.scheduledWorkdays",
        "Scheduled workdays cannot contain duplicate days."
      );
    }

    const dailyDateSet = new Set();

    for (
      const entry of
      this.dailyEntries || []
    ) {
      if (!isValidYmdDate(entry.workDate)) {
        this.invalidate(
          "dailyEntries",
          "Every attendance day must contain a valid YYYY-MM-DD work date."
        );
      }

      if (
        dailyDateSet.has(
          entry.workDate
        )
      ) {
        this.invalidate(
          "dailyEntries",
          `Attendance period contains duplicate date ${entry.workDate}.`
        );
      }

      dailyDateSet.add(
        entry.workDate
      );
    }

    const adjustmentNumberSet =
      new Set();

    for (
      const adjustment of
      this.adjustments || []
    ) {
      if (
        adjustmentNumberSet.has(
          adjustment.adjustmentNumber
        )
      ) {
        this.invalidate(
          "adjustments",
          `Duplicate adjustment number ${adjustment.adjustmentNumber}.`
        );
      }

      adjustmentNumberSet.add(
        adjustment.adjustmentNumber
      );
    }

    if (
      this.status ===
        "Payroll Ready" &&
      !this.managerApprovedAt
    ) {
      this.invalidate(
        "status",
        "An attendance period cannot become Payroll Ready before manager approval."
      );
    }

    next();
  }
);

module.exports = mongoose.model(
  "AttendancePeriod",
  AttendancePeriodSchema
);