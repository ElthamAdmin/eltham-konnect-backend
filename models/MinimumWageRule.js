const mongoose = require("mongoose");

const MinimumWageRuleSchema =
  new mongoose.Schema(
    {
      ruleCode: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
        index: true,
      },

      name: {
        type: String,
        required: true,
        trim: true,
      },

      jurisdiction: {
        type: String,
        default: "Jamaica",
        trim: true,
      },

      workerCategory: {
        type: String,
        enum: [
          "General",
          "Industrial Security Guard",
          "Other",
        ],
        default: "General",
        index: true,
      },

      currency: {
        type: String,
        default: "JMD",
        trim: true,
        uppercase: true,
      },

      effectiveFrom: {
        type: Date,
        required: true,
        index: true,
      },

      effectiveTo: {
        type: Date,
        default: null,
        index: true,
      },

      standardWeeklyHours: {
        type: Number,
        required: true,
        min: 0,
        default: 40,
      },

      weeklyRate: {
        type: Number,
        required: true,
        min: 0,
      },

      hourlyRate: {
        type: Number,
        required: true,
        min: 0,
      },

      calculationSettings: {
        assessPayableHours: {
          type: Boolean,
          default: true,
        },

        includeApprovedAdjustments: {
          type: Boolean,
          default: true,
        },

        includePaidLeaveHours: {
          type: Boolean,
          default: true,
        },

        excludeUnpaidLeaveHours: {
          type: Boolean,
          default: true,
        },

        requirePayrollReadyAttendance: {
          type: Boolean,
          default: true,
        },

        blockNonCompliantPayrollApproval: {
          type: Boolean,
          default: true,
        },
      },

      sourceName: {
        type: String,
        required: true,
        trim: true,
      },

      sourceUrl: {
        type: String,
        required: true,
        trim: true,
      },

      sourceReference: {
        type: String,
        required: true,
        trim: true,
      },

      sourceVerifiedAt: {
        type: Date,
        required: true,
      },

      status: {
        type: String,
        enum: [
          "Draft",
          "Active",
          "Retired",
        ],
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

      retiredBy: {
        type: String,
        default: "",
        trim: true,
      },

      retiredAt: {
        type: Date,
        default: null,
      },

      retirementReason: {
        type: String,
        default: "",
        trim: true,
      },

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

MinimumWageRuleSchema.index({
  workerCategory: 1,
  status: 1,
  effectiveFrom: -1,
});

MinimumWageRuleSchema.index({
  effectiveFrom: 1,
  effectiveTo: 1,
});

MinimumWageRuleSchema.pre(
  "validate",
  function validateMinimumWageRule() {
    if (
      this.effectiveTo &&
      this.effectiveFrom &&
      this.effectiveTo <
        this.effectiveFrom
    ) {
      throw new Error(
        "Minimum-wage effective-to date cannot precede the effective-from date."
      );
    }

    const expectedWeeklyRate =
      Number(
        this.hourlyRate || 0
      ) *
      Number(
        this.standardWeeklyHours || 0
      );

    if (
      expectedWeeklyRate > 0 &&
      Math.abs(
        expectedWeeklyRate -
          Number(
            this.weeklyRate || 0
          )
      ) > 0.01
    ) {
      throw new Error(
        "Weekly minimum wage must equal the hourly rate multiplied by standard weekly hours."
      );
    }
  }
);

module.exports = mongoose.model(
  "MinimumWageRule",
  MinimumWageRuleSchema
);