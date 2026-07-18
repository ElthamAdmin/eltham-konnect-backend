const mongoose = require("mongoose");

const nonNegativeMoneyField = {
  type: Number,
  default: 0,
  min: 0,
};

const gctRegisterEntrySchema = new mongoose.Schema(
  {
    registerNumber: {
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

    transactionDate: {
      type: String,
      required: true,
      index: true,
    },

    registerType: {
      type: String,
      enum: ["Output GCT", "Input GCT"],
      required: true,
      index: true,
    },

    sourceDocumentType: {
      type: String,
      enum: [
        "Invoice",
        "Expense",
        "Credit Note",
        "Debit Note",
        "Adjustment",
      ],
      required: true,
      index: true,
    },

    sourceDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    sourceDocumentNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    counterpartyName: {
      type: String,
      default: "",
      trim: true,
    },

    counterpartyTrn: {
      type: String,
      default: "",
      trim: true,
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

    calculationMode: {
      type: String,
      enum: ["Preview", "Compliance"],
      default: "Preview",
      index: true,
    },

    classification: {
      type: String,
      enum: [
        "Taxable",
        "Exempt",
        "Zero Rated",
        "Outside Scope",
        "Recovery",
        "Disbursement",
        "Pending Review",
      ],
      default: "Pending Review",
      index: true,
    },

    classificationStatus: {
      type: String,
      enum: [
        "Preliminary",
        "Reviewed",
        "Adjusted",
        "Excluded",
      ],
      default: "Preliminary",
      index: true,
    },

    grossAmount: nonNegativeMoneyField,

    recoveryAmount: nonNegativeMoneyField,

    customsRecovery: nonNegativeMoneyField,

    exemptAmount: nonNegativeMoneyField,

    zeroRatedAmount: nonNegativeMoneyField,

    outsideScopeAmount: nonNegativeMoneyField,

    taxableAmount: nonNegativeMoneyField,

    gctRate: {
      type: Number,
      default: 0,
      min: 0,
    },

    gctAmount: nonNegativeMoneyField,

    claimableGctAmount: nonNegativeMoneyField,

    disallowedGctAmount: nonNegativeMoneyField,

    pendingVerificationGctAmount:
      nonNegativeMoneyField,

    supplierEvidence: {
      supplierGctRegistered: {
        type: Boolean,
        default: false,
      },

      supplierTrn: {
        type: String,
        default: "",
        trim: true,
      },

      supplierGctRegistrationNumber: {
        type: String,
        default: "",
        trim: true,
      },

      taxInvoiceNumber: {
        type: String,
        default: "",
        trim: true,
      },

      taxInvoiceDate: {
        type: String,
        default: "",
      },

      receiptUrl: {
        type: String,
        default: "",
        trim: true,
      },

      documentVerified: {
        type: Boolean,
        default: false,
      },

      verifiedBy: {
        type: String,
        default: "",
        trim: true,
      },

      verifiedAt: {
        type: Date,
        default: null,
      },
    },

    eligibility: {
      canChargeOutputGct: {
        type: Boolean,
        default: false,
      },

      canClaimInputGct: {
        type: Boolean,
        default: false,
      },

      includedInReturn: {
        type: Boolean,
        default: false,
      },

      blockReason: {
        type: String,
        default: "",
        trim: true,
      },
    },

    filingPeriodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GctFilingPeriod",
      default: null,
      index: true,
    },

    filingNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    sourceSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
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

gctRegisterEntrySchema.index(
  {
    entityCode: 1,
    registerType: 1,
    sourceDocumentType: 1,
    sourceDocumentId: 1,
  },
  {
    unique: true,
  }
);

gctRegisterEntrySchema.index({
  entityCode: 1,
  periodKey: 1,
  registerType: 1,
  classificationStatus: 1,
});

gctRegisterEntrySchema.pre(
  "validate",
  function validateGctRegisterEntry() {
    if (this.periodStart > this.periodEnd) {
      throw new Error(
        "GCT register period start cannot be later than its end date."
      );
    }

    if (
      this.transactionDate < this.periodStart ||
      this.transactionDate > this.periodEnd
    ) {
      throw new Error(
        "The GCT transaction date must fall inside its filing period."
      );
    }

    if (this.calculationMode === "Preview") {
      this.eligibility.canChargeOutputGct = false;
      this.eligibility.canClaimInputGct = false;
      this.eligibility.includedInReturn = false;
    }

    if (
      this.calculationMode === "Compliance" &&
      this.registrationStatus !== "Registered"
    ) {
      throw new Error(
        "A Compliance GCT register entry requires an effective Registered profile."
      );
    }

    if (this.registerType === "Output GCT") {
      this.claimableGctAmount = 0;
      this.disallowedGctAmount = 0;
      this.pendingVerificationGctAmount = 0;

      if (!this.eligibility.canChargeOutputGct) {
        this.gctAmount = 0;
      }
    }

    if (this.registerType === "Input GCT") {
      if (!this.eligibility.canClaimInputGct) {
        this.claimableGctAmount = 0;
      }

      const allocatedInputGct =
        Number(this.claimableGctAmount || 0) +
        Number(this.disallowedGctAmount || 0) +
        Number(this.pendingVerificationGctAmount || 0);

      if (
        allocatedInputGct >
        Number(this.gctAmount || 0)
      ) {
        throw new Error(
          "Allocated input GCT cannot exceed the GCT paid."
        );
      }
    }
  }
);

module.exports = mongoose.model(
  "GctRegisterEntry",
  gctRegisterEntrySchema
);