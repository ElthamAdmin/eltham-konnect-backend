const mongoose = require("mongoose");

const incomeTaxRuleSchema = new mongoose.Schema(
  {
    ruleCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    countryCode: {
      type: String,
      default: "JM",
      trim: true,
      uppercase: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    incomeTaxType: {
      type: String,
      enum: [
        "Individual Income Tax",
        "Company Income Tax",
      ],
      required: true,
      index: true,
    },

    applicableEntityTypes: [
      {
        type: String,
        enum: [
          "Sole Proprietorship",
          "Limited Liability Company",
          "Partnership",
        ],
      },
    ],

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

    filingFrequency: {
      type: String,
      enum: [
        "Annual",
        "Quarterly",
        "Monthly",
        "Other",
      ],
      default: "Annual",
    },

    calculationMethod: {
      type: String,
      enum: [
        "Progressive",
        "Flat Rate",
        "Manual Assessment",
      ],
      required: true,
    },

    currency: {
      type: String,
      default: "JMD",
      trim: true,
      uppercase: true,
    },

    annualThreshold: {
      type: Number,
      default: 0,
      min: 0,
    },

    flatRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },

    rateBands: [
      {
        lowerBound: {
          type: Number,
          default: 0,
          min: 0,
        },

        upperBound: {
          type: Number,
          default: null,
          min: 0,
        },

        rate: {
          type: Number,
          required: true,
          min: 0,
          max: 1,
        },

        description: {
          type: String,
          default: "",
          trim: true,
        },
      },
    ],

    calculationSettings: {
      allowBusinessExpenses: {
        type: Boolean,
        default: true,
      },

      allowCapitalAllowances: {
        type: Boolean,
        default: false,
      },

      allowLossCarryForward: {
        type: Boolean,
        default: false,
      },

      lossCarryForwardYears: {
        type: Number,
        default: 0,
        min: 0,
      },

      includeOtherIncome: {
        type: Boolean,
        default: true,
      },

      estimatedTaxRequired: {
        type: Boolean,
        default: false,
      },

      estimatedPaymentInstallments: {
        type: Number,
        default: 0,
        min: 0,
      },
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
      enum: ["Draft", "Active", "Retired"],
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

incomeTaxRuleSchema.index({
  countryCode: 1,
  incomeTaxType: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
  status: 1,
});

incomeTaxRuleSchema.pre("validate", function validateRule(next) {
  if (
    this.effectiveTo &&
    this.effectiveFrom &&
    this.effectiveTo < this.effectiveFrom
  ) {
    return next(
      new Error(
        "The income-tax rule effective-to date cannot be earlier than its effective-from date."
      )
    );
  }

  if (
    this.calculationMethod === "Flat Rate" &&
    Number(this.flatRate || 0) <= 0
  ) {
    return next(
      new Error(
        "A positive flat rate is required for a Flat Rate income-tax rule."
      )
    );
  }

  if (
    this.calculationMethod === "Progressive" &&
    (!Array.isArray(this.rateBands) ||
      this.rateBands.length === 0)
  ) {
    return next(
      new Error(
        "At least one rate band is required for a Progressive income-tax rule."
      )
    );
  }

  next();
});

module.exports = mongoose.model(
  "IncomeTaxRule",
  incomeTaxRuleSchema
);