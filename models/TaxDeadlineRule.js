const mongoose = require("mongoose");

const TAX_TYPES = [
  "GCT",
  "PAYE",
  "NIS",
  "NHT",
  "Education Tax",
  "HEART",
  "Pension",
  "Income Tax",
  "Individual Income Tax",
  "Company Tax",
  "Company Income Tax",
  "Other",
];

const BUSINESS_TYPES = [
  "Sole Proprietorship",
  "Limited Liability Company",
  "Partnership",
  "All",
];

const TaxDeadlineRuleSchema = new mongoose.Schema(
  {
    ruleCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    countryCode: {
      type: String,
      default: "JM",
      trim: true,
      index: true,
    },

    taxType: {
      type: String,
      enum: TAX_TYPES,
      required: true,
      index: true,
    },

    businessType: {
      type: String,
      enum: BUSINESS_TYPES,
      default: "All",
      index: true,
    },

    filingFrequency: {
      type: String,
      enum: [
        "Monthly",
        "Quarterly",
        "Annual",
        "One-Time",
        "Other",
      ],
      required: true,
      index: true,
    },

    filingForm: {
      type: String,
      default: "",
      trim: true,
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

    dueDateRule: {
      monthsAfterPeriodEnd: {
        type: Number,
        default: 0,
        min: 0,
      },

      fixedDayOfMonth: {
        type: Number,
        default: 0,
        min: 0,
        max: 31,
      },

      daysAfterPeriodEnd: {
        type: Number,
        default: 0,
        min: 0,
      },

      useMonthEnd: {
        type: Boolean,
        default: false,
      },

      weekendAdjustment: {
        type: String,
        enum: [
          "None",
          "Previous Business Day",
          "Next Business Day",
        ],
        default: "None",
      },
    },

    reminderDays: {
      type: [Number],
      default: [30, 14, 7, 3, 1],
    },

    sourceName: {
      type: String,
      default: "",
      trim: true,
    },

    sourceUrl: {
      type: String,
      default: "",
      trim: true,
    },

    sourceReference: {
      type: String,
      default: "",
      trim: true,
    },

    sourceVerifiedAt: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "Draft",
        "Active",
        "Inactive",
        "Superseded",
      ],
      default: "Draft",
      index: true,
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

TaxDeadlineRuleSchema.index({
  taxType: 1,
  businessType: 1,
  effectiveFrom: -1,
  status: 1,
});

TaxDeadlineRuleSchema.pre(
  "validate",
  function validateDeadlineRule() {
    const rule = this.dueDateRule || {};

    const configuredMethods = [
      Number(rule.fixedDayOfMonth || 0) > 0,
      Number(rule.daysAfterPeriodEnd || 0) > 0,
      rule.useMonthEnd === true,
    ].filter(Boolean).length;

    if (
      this.status === "Active" &&
      configuredMethods !== 1
    ) {
      throw new Error(
        "An active deadline rule must use exactly one due-date method: fixed day, days after period end, or month end."
      );
    }

    if (
      this.effectiveTo &&
      this.effectiveFrom &&
      this.effectiveTo < this.effectiveFrom
    ) {
      throw new Error(
        "Effective-to date cannot be earlier than effective-from date."
      );
    }

    this.reminderDays = [
      ...new Set(
        (this.reminderDays || [])
          .map(Number)
          .filter(
            (days) =>
              Number.isInteger(days) && days >= 0
          )
      ),
    ].sort((a, b) => b - a);
  }
);

module.exports = mongoose.model(
  "TaxDeadlineRule",
  TaxDeadlineRuleSchema
);