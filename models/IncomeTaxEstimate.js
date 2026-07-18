const mongoose = require("mongoose");

const incomeTaxEstimateSchema = new mongoose.Schema(
  {
    estimateNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessEntity",
      required: true,
      index: true,
    },

    entityCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    entitySnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
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

    periodKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    periodStart: {
      type: Date,
      required: true,
      index: true,
    },

    periodEnd: {
      type: Date,
      required: true,
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

    calculationMode: {
      type: String,
      enum: [
        "System Calculated",
        "Manual Assessment",
      ],
      default: "System Calculated",
    },

    incomeTaxRuleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncomeTaxRule",
      default: null,
      index: true,
    },

    incomeTaxRuleCode: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
      index: true,
    },

    ruleSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    financialSummary: {
      grossRevenue: {
        type: Number,
        default: 0,
      },

      costOfSales: {
        type: Number,
        default: 0,
      },

      grossProfit: {
        type: Number,
        default: 0,
      },

      operatingExpenses: {
        type: Number,
        default: 0,
      },

      otherIncome: {
        type: Number,
        default: 0,
      },

      accountingProfit: {
        type: Number,
        default: 0,
      },
    },

    taxAdjustments: {
      nonDeductibleExpenses: {
        type: Number,
        default: 0,
        min: 0,
      },

      exemptIncome: {
        type: Number,
        default: 0,
        min: 0,
      },

      capitalAllowances: {
        type: Number,
        default: 0,
        min: 0,
      },

      lossCarryForwardApplied: {
        type: Number,
        default: 0,
        min: 0,
      },

      otherAddBacks: {
        type: Number,
        default: 0,
        min: 0,
      },

      otherDeductions: {
        type: Number,
        default: 0,
        min: 0,
      },

      adjustmentNotes: {
        type: String,
        default: "",
        trim: true,
      },
    },

    estimatedTaxableIncome: {
      type: Number,
      default: 0,
      min: 0,
    },

    grossIncomeTax: {
      type: Number,
      default: 0,
      min: 0,
    },

    taxCredits: {
      type: Number,
      default: 0,
      min: 0,
    },

    priorPayments: {
      type: Number,
      default: 0,
      min: 0,
    },

    estimatedTaxDue: {
      type: Number,
      default: 0,
      min: 0,
    },

    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    balanceDue: {
      type: Number,
      default: 0,
      min: 0,
    },

    dueDate: {
      type: Date,
      default: null,
      index: true,
    },

    filingReference: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    filingMethod: {
      type: String,
      enum: [
        "Not Filed",
        "Online",
        "Manual",
        "Tax Authority Assessment",
        "Other",
      ],
      default: "Not Filed",
    },

    filedDate: {
      type: Date,
      default: null,
    },

    taxRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxRecord",
      default: null,
      index: true,
    },

    taxNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    calculationSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    calculatedBy: {
      type: String,
      default: "",
      trim: true,
    },

    calculatedAt: {
      type: Date,
      default: null,
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

    approvedBy: {
      type: String,
      default: "",
      trim: true,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    approvalNotes: {
      type: String,
      default: "",
      trim: true,
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

    reconciledBy: {
      type: String,
      default: "",
      trim: true,
    },

    reconciledAt: {
      type: Date,
      default: null,
    },

    reconciliationNotes: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "Draft",
        "Calculated",
        "Reviewed",
        "Approved",
        "Submitted",
        "Partially Paid",
        "Paid",
        "Reconciled",
        "Cancelled",
      ],
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
        },

        notes: {
          type: String,
          default: "",
        },

        performedBy: {
          type: String,
          default: "",
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

incomeTaxEstimateSchema.index(
  {
    entityCode: 1,
    incomeTaxType: 1,
    periodKey: 1,
  },
  {
    unique: true,
  }
);

incomeTaxEstimateSchema.pre(
  "validate",
  function validateEstimate(next) {
    if (
      this.periodStart &&
      this.periodEnd &&
      this.periodEnd < this.periodStart
    ) {
      return next(
        new Error(
          "The income-tax period end cannot be earlier than its start."
        )
      );
    }

    if (
      Number(this.amountPaid || 0) >
      Number(this.estimatedTaxDue || 0)
    ) {
      return next(
        new Error(
          "The amount paid cannot exceed the estimated tax due."
        )
      );
    }

    next();
  }
);

module.exports = mongoose.model(
  "IncomeTaxEstimate",
  incomeTaxEstimateSchema
);