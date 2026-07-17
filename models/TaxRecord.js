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

const TAX_CATEGORIES = [
  "Payroll Statutory",
  "Consumption Tax",
  "Income Tax",
  "Pension",
  "Other",
];

const BUSINESS_TYPES = [
  "Sole Proprietorship",
  "Limited Liability Company",
  "Partnership",
];

const RECORD_STATUSES = [
  "Draft",
  "Calculated",
  "Reviewed",
  "Approved",
  "Submitted",
  "Partially Paid",
  "Paid",
  "Reconciled",
  "Overdue",
  "Cancelled",
];

const SOURCE_TYPES = [
  "Manual",
  "Payroll",
  "GCT Return",
  "Income Tax Estimate",
  "Opening Balance",
  "Adjustment",
];

const moneyField = {
  type: Number,
  default: 0,
  min: 0,
};

const taxRecordSchema = new mongoose.Schema(
  {
    taxNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    taxType: {
      type: String,
      enum: TAX_TYPES,
      required: true,
      index: true,
    },

    taxCategory: {
      type: String,
      enum: TAX_CATEGORIES,
      default: "Other",
      index: true,
    },

    businessType: {
      type: String,
      enum: BUSINESS_TYPES,
      default: "Sole Proprietorship",
      index: true,
    },

    businessName: {
      type: String,
      default: "Eltham Konnect",
      trim: true,
    },

    businessTrn: {
      type: String,
      default: "",
      trim: true,
    },

    periodKey: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    periodStart: {
      type: String,
      required: true,
      index: true,
    },

    periodEnd: {
      type: String,
      required: true,
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
      default: "Monthly",
    },

    sourceType: {
      type: String,
      enum: SOURCE_TYPES,
      default: "Manual",
      index: true,
    },

    sourceModule: {
      type: String,
      default: "Tax Center",
      trim: true,
    },

    sourceReference: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    payrollNumbers: {
      type: [String],
      default: [],
    },

    payrollRecordCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    taxableAmount: moneyField,

    taxRate: {
      type: Number,
      default: 0,
      min: 0,
    },

    employeePortion: moneyField,

    employerPortion: moneyField,

    adjustmentAmount: {
      type: Number,
      default: 0,
    },

    penaltyAmount: moneyField,

    interestAmount: moneyField,

    taxDue: moneyField,

    amountPaid: moneyField,

    balanceDue: moneyField,

    liabilityBreakdown: {
      paye: moneyField,

      nisEmployee: moneyField,
      nisEmployer: moneyField,

      nhtEmployee: moneyField,
      nhtEmployer: moneyField,

      educationTaxEmployee: moneyField,
      educationTaxEmployer: moneyField,

      heartEmployer: moneyField,

      pensionEmployee: moneyField,
      pensionEmployer: moneyField,

      gctOutputTax: moneyField,
      gctInputTaxCredit: moneyField,

      individualIncomeTax: moneyField,
      companyIncomeTax: moneyField,

      otherAmount: moneyField,
    },

    calculationRuleCode: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    calculationSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

        deadlineRuleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxDeadlineRule",
      default: null,
    },

    deadlineRuleCode: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    deadlineRuleSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    deadlineOverride: {
      isOverridden: {
        type: Boolean,
        default: false,
      },

      originalDueDate: {
        type: String,
        default: "",
      },

      overrideReason: {
        type: String,
        default: "",
        trim: true,
      },

      overriddenBy: {
        type: String,
        default: "",
        trim: true,
      },

      overriddenAt: {
        type: Date,
        default: null,
      },
    },

    dueDate: {
      type: String,
      default: "",
      index: true,
    },

    filedDate: {
      type: String,
      default: "",
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
        "TAJ Online",
        "Manual Submission",
        "Tax Agent",
        "Other",
      ],
      default: "Not Filed",
    },

    status: {
      type: String,
      enum: RECORD_STATUSES,
      default: "Draft",
      index: true,
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

    submissionNotes: {
      type: String,
      default: "",
      trim: true,
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

    workflowHistory: [
      {
        fromStatus: {
          type: String,
          default: "",
          trim: true,
        },

        toStatus: {
          type: String,
          required: true,
          trim: true,
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

    remittances: [
      {
        remittanceNumber: {
          type: String,
          required: true,
          trim: true,
        },

        paymentDate: {
          type: String,
          required: true,
        },

        amount: {
          type: Number,
          required: true,
          min: 0,
        },

        paymentMethod: {
          type: String,
          default: "",
          trim: true,
        },

        paymentReference: {
          type: String,
          default: "",
          trim: true,
        },

        paymentAccountNumber: {
          type: String,
          default: "",
          trim: true,
        },

        paymentAccountName: {
          type: String,
          default: "",
          trim: true,
        },

        journalEntryNumber: {
          type: String,
          default: "",
          trim: true,
        },

        receiptUrl: {
          type: String,
          default: "",
          trim: true,
        },

        notes: {
          type: String,
          default: "",
          trim: true,
        },

        recordedBy: {
          type: String,
          default: "",
          trim: true,
        },

        recordedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    journalEntryNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    reversalJournalEntryNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    cancelledReason: {
      type: String,
      default: "",
      trim: true,
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

taxRecordSchema.index({
  taxType: 1,
  periodStart: 1,
  periodEnd: 1,
  status: 1,
});

taxRecordSchema.index({
  businessType: 1,
  periodKey: 1,
  taxCategory: 1,
});

taxRecordSchema.index({
  sourceType: 1,
  sourceReference: 1,
});

taxRecordSchema.pre("validate", function setCalculatedValues() {
  const employeePortion = Number(this.employeePortion || 0);
  const employerPortion = Number(this.employerPortion || 0);
  const adjustmentAmount = Number(this.adjustmentAmount || 0);
  const penaltyAmount = Number(this.penaltyAmount || 0);
  const interestAmount = Number(this.interestAmount || 0);

  if (!this.periodKey && this.periodStart) {
    this.periodKey = String(this.periodStart).slice(0, 7);
  }

  if (
    Number(this.taxDue || 0) === 0 &&
    (employeePortion > 0 || employerPortion > 0)
  ) {
    this.taxDue = Math.max(
      0,
      employeePortion +
        employerPortion +
        adjustmentAmount +
        penaltyAmount +
        interestAmount
    );
  }

  this.amountPaid = Math.max(
    0,
    Number(this.amountPaid || 0)
  );

  this.balanceDue = Math.max(
    0,
    Number(this.taxDue || 0) - this.amountPaid
  );
});

module.exports = mongoose.model("TaxRecord", taxRecordSchema);