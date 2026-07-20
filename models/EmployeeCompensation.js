const mongoose = require("mongoose");

const COMPENSATION_TYPES = [
  "Salary",
  "Wage",
  "Stipend",
  "Allowance",
];

const COMPENSATION_CATEGORIES = [
  "Base Pay",
  "Recurring Addition",
];

const RATE_UNITS = [
  "Hourly",
  "Daily",
  "Weekly",
  "Fortnightly",
  "Semi-Monthly",
  "Monthly",
  "Annual",
  "Fixed Period",
];

const PAY_FREQUENCIES = [
  "Weekly",
  "Fortnightly",
  "Semi-Monthly",
  "Monthly",
  "Annual",
];

const COMPENSATION_STATUSES = [
  "Draft",
  "Active",
  "Superseded",
  "Cancelled",
];

const CHANGE_REASONS = [
  "Initial Compensation",
  "Promotion",
  "Annual Review",
  "Market Adjustment",
  "Minimum Wage Adjustment",
  "Contract Renewal",
  "Role Change",
  "Hours Change",
  "Allowance Granted",
  "Allowance Changed",
  "Allowance Ended",
  "Correction",
  "Other",
];

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const isValidYmdDate = (value) => {
  if (!YMD_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const compensationWorkflowSchema =
  new mongoose.Schema(
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

      reason: {
        type: String,
        default: "",
        trim: true,
      },

      performedBy: {
        type: String,
        required: true,
        trim: true,
      },

      performedAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      _id: true,
    }
  );

const employeeCompensationSchema =
  new mongoose.Schema(
    {
      compensationNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
      },

      employeeId: {
        type: String,
        required: true,
        index: true,
        trim: true,
      },

      employeeNameSnapshot: {
        type: String,
        required: true,
        trim: true,
      },

      jobTitleSnapshot: {
        type: String,
        default: "",
        trim: true,
      },

      departmentSnapshot: {
        type: String,
        default: "",
        trim: true,
      },

      branchSnapshot: {
        type: String,
        default: "",
        trim: true,
      },

      compensationType: {
        type: String,
        enum: COMPENSATION_TYPES,
        required: true,
        index: true,
      },

      compensationCategory: {
        type: String,
        enum: COMPENSATION_CATEGORIES,
        required: true,
        index: true,
      },

      componentCode: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        index: true,
      },

      componentName: {
        type: String,
        required: true,
        trim: true,
      },

            amount: {
        type: Number,
        required: true,
        min: [
          0.01,
          "Compensation amount must be greater than zero.",
        ],
      },

      currency: {
        type: String,
        enum: ["JMD"],
        default: "JMD",
      },

      rateUnit: {
        type: String,
        enum: RATE_UNITS,
        required: true,
      },

      payFrequency: {
        type: String,
        enum: PAY_FREQUENCIES,
        required: true,
      },

      standardHoursPerDay: {
        type: Number,
        default: 0,
        min: 0,
        max: 24,
      },

      standardHoursPerWeek: {
        type: Number,
        default: 0,
        min: 0,
        max: 168,
      },

      effectiveFrom: {
        type: String,
        required: true,
        index: true,
      },

      effectiveTo: {
        type: String,
        default: "",
        index: true,
      },

      changeReason: {
        type: String,
        enum: CHANGE_REASONS,
        required: true,
      },

      changeNotes: {
        type: String,
        default: "",
        trim: true,
      },

      supportingDocumentReference: {
        type: String,
        default: "",
        trim: true,
      },

      replacesCompensationNumber: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      replacedByCompensationNumber: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      status: {
        type: String,
        enum: COMPENSATION_STATUSES,
        default: "Draft",
        index: true,
      },

      approvedBy: {
        type: String,
        default: "",
        trim: true,
      },

      approvedAt: {
        type: Date,
        default: null,
      },

      cancelledBy: {
        type: String,
        default: "",
        trim: true,
      },

      cancelledAt: {
        type: Date,
        default: null,
      },

      cancellationReason: {
        type: String,
        default: "",
        trim: true,
      },

      workflowHistory: {
        type: [compensationWorkflowSchema],
        default: [],
      },

      createdBy: {
        type: String,
        required: true,
        trim: true,
      },

      updatedBy: {
        type: String,
        required: true,
        trim: true,
      },
    },
    {
      timestamps: true,
      optimisticConcurrency: true,
    }
  );

employeeCompensationSchema.index({
  employeeId: 1,
  compensationCategory: 1,
  componentCode: 1,
  effectiveFrom: -1,
});

employeeCompensationSchema.index({
  employeeId: 1,
  status: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
});

employeeCompensationSchema.pre(
  "validate",
  function () {
    this.componentCode = String(
      this.componentCode || ""
    )
      .trim()
      .toUpperCase();

    this.componentName = String(
      this.componentName || ""
    ).trim();

    this.effectiveFrom = String(
      this.effectiveFrom || ""
    ).trim();

    this.effectiveTo = String(
      this.effectiveTo || ""
    ).trim();

    if (
      !isValidYmdDate(
        this.effectiveFrom
      )
    ) {
      this.invalidate(
        "effectiveFrom",
        "Compensation effective date must use a valid YYYY-MM-DD date."
      );
    }

    if (
      this.effectiveTo &&
      !isValidYmdDate(this.effectiveTo)
    ) {
      this.invalidate(
        "effectiveTo",
        "Compensation end date must use a valid YYYY-MM-DD date."
      );
    }

    if (
      this.effectiveFrom &&
      this.effectiveTo &&
      this.effectiveTo <
        this.effectiveFrom
    ) {
      this.invalidate(
        "effectiveTo",
        "Compensation end date cannot be earlier than its effective date."
      );
    }

    if (
      this.compensationType ===
        "Allowance" &&
      this.compensationCategory !==
        "Recurring Addition"
    ) {
      this.invalidate(
        "compensationCategory",
        "Allowance records must use Recurring Addition category."
      );
    }

    if (
      this.compensationType !==
        "Allowance" &&
      this.compensationCategory !==
        "Base Pay"
    ) {
      this.invalidate(
        "compensationCategory",
        "Salary, Wage and Stipend records must use Base Pay category."
      );
    }

    if (
      Number(this.standardHoursPerDay || 0) >
        0 &&
      Number(
        this.standardHoursPerWeek || 0
      ) > 0 &&
      Number(
        this.standardHoursPerWeek
      ) <
        Number(this.standardHoursPerDay)
    ) {
      this.invalidate(
        "standardHoursPerWeek",
        "Standard weekly hours cannot be less than standard daily hours."
      );
    }

    if (
      this.status === "Active" &&
      (!this.approvedBy ||
        !this.approvedAt)
    ) {
      this.invalidate(
        "status",
        "Active compensation must record its approver and approval date."
      );
    }

    if (
      this.status === "Cancelled" &&
      !this.cancellationReason
    ) {
      this.invalidate(
        "cancellationReason",
        "Cancelled compensation requires a cancellation reason."
      );
    }
  }
);

module.exports = mongoose.model(
  "EmployeeCompensation",
  employeeCompensationSchema
);