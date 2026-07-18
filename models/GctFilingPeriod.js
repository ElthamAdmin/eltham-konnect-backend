const mongoose = require("mongoose");

const moneyField = {
  type: Number,
  default: 0,
};

const nonNegativeMoneyField = {
  type: Number,
  default: 0,
  min: 0,
};

const gctFilingPeriodSchema = new mongoose.Schema(
  {
    filingNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    entityCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    entityName: {
      type: String,
      required: true,
      trim: true,
    },

    businessType: {
      type: String,
      enum: [
        "Sole Proprietorship",
        "Limited Liability Company",
        "Partnership",
      ],
      required: true,
      index: true,
    },

    businessTrn: {
      type: String,
      default: "",
      trim: true,
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
      index: true,
    },

    periodEnd: {
      type: String,
      required: true,
      index: true,
    },

    filingFrequency: {
      type: String,
      enum: ["Monthly", "Quarterly"],
      default: "Monthly",
    },

    calculationMode: {
      type: String,
      enum: ["Preview", "Compliance"],
      default: "Preview",
      index: true,
    },

    registrationProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxRegistrationProfile",
      default: null,
    },

    registrationCode: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    registrationStatus: {
      type: String,
      enum: [
        "Not Registered",
        "Registration Pending",
        "Registered",
        "Suspended",
        "Cancelled",
      ],
      default: "Not Registered",
      index: true,
    },

    registrationNumber: {
      type: String,
      default: "",
      trim: true,
    },

    registrationSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    canChargeGct: {
      type: Boolean,
      default: false,
    },

    canClaimInputGct: {
      type: Boolean,
      default: false,
    },

    canFileReturn: {
      type: Boolean,
      default: false,
    },

    complianceBlockReason: {
      type: String,
      default: "",
      trim: true,
    },

    standardRate: {
      type: Number,
      default: 0,
      min: 0,
    },

    rateRuleCode: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    invoiceCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    reviewedInvoiceCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    unreviewedInvoiceCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    expenseCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    verifiedExpenseCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    unverifiedExpenseCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    outputGctSummary: {
      grossInvoiceAmount: nonNegativeMoneyField,

      customerPurchaseRecovery: nonNegativeMoneyField,

      customsRecovery: nonNegativeMoneyField,

      exemptSales: nonNegativeMoneyField,

      zeroRatedSales: nonNegativeMoneyField,

      outsideScopeSales: nonNegativeMoneyField,

      taxableSales: nonNegativeMoneyField,

      outputGct: nonNegativeMoneyField,
    },

    inputGctSummary: {
      grossExpenseAmount: nonNegativeMoneyField,

      amountExcludingGct: nonNegativeMoneyField,

      inputGctPaid: nonNegativeMoneyField,

      claimableInputGct: nonNegativeMoneyField,

      disallowedInputGct: nonNegativeMoneyField,

      pendingVerificationInputGct:
        nonNegativeMoneyField,
    },

    adjustments: {
      outputAdjustment: moneyField,

      inputAdjustment: moneyField,

      adjustmentReason: {
        type: String,
        default: "",
        trim: true,
      },

      adjustedBy: {
        type: String,
        default: "",
        trim: true,
      },

      adjustedAt: {
        type: Date,
        default: null,
      },
    },

    outputGct: nonNegativeMoneyField,

    inputGctCredit: nonNegativeMoneyField,

    netGct: moneyField,

    netPosition: {
      type: String,
      enum: ["Payable", "Refundable", "Neutral"],
      default: "Neutral",
      index: true,
    },

    taxRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxRecord",
      default: null,
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

    filedDate: {
      type: String,
      default: "",
      index: true,
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
        "Preview",
        "Calculated",
        "Reviewed",
        "Approved",
        "Submitted",
        "Paid",
        "Reconciled",
        "Cancelled",
      ],
      default: "Preview",
      index: true,
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

gctFilingPeriodSchema.index(
  {
    entityCode: 1,
    periodKey: 1,
  },
  {
    unique: true,
  }
);

gctFilingPeriodSchema.index({
  registrationCode: 1,
  periodStart: 1,
  periodEnd: 1,
});

gctFilingPeriodSchema.pre(
  "validate",
  function calculateNetGctPosition() {
    if (this.periodStart > this.periodEnd) {
      throw new Error(
        "GCT period start cannot be later than its end date."
      );
    }

    if (this.calculationMode === "Preview") {
      this.canFileReturn = false;
      this.status = "Preview";
    }

    if (
      this.calculationMode === "Compliance" &&
      this.registrationStatus !== "Registered"
    ) {
      throw new Error(
        "A Compliance GCT period requires an effective Registered profile."
      );
    }

    const outputGct =
      Number(this.outputGctSummary?.outputGct || 0) +
      Number(this.adjustments?.outputAdjustment || 0);

    const inputGctCredit =
      Number(this.inputGctSummary?.claimableInputGct || 0) +
      Number(this.adjustments?.inputAdjustment || 0);

    this.outputGct =
      Math.round(
        (Math.max(0, outputGct) + Number.EPSILON) * 100
      ) / 100;

    this.inputGctCredit =
      Math.round(
        (Math.max(0, inputGctCredit) +
          Number.EPSILON) *
          100
      ) / 100;

    this.netGct =
      Math.round(
        (this.outputGct -
          this.inputGctCredit +
          Number.EPSILON) *
          100
      ) / 100;

    if (this.netGct > 0) {
      this.netPosition = "Payable";
    } else if (this.netGct < 0) {
      this.netPosition = "Refundable";
    } else {
      this.netPosition = "Neutral";
    }
  }
);

module.exports = mongoose.model(
  "GctFilingPeriod",
  gctFilingPeriodSchema
);