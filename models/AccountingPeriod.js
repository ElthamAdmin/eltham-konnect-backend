const mongoose = require("mongoose");

const accountingPeriodSchema = new mongoose.Schema(
  {
    periodNumber: {
      type: String,
      required: true,
      unique: true,
    },

    fiscalYear: {
      type: Number,
      required: true,
    },

    periodMonth: {
      type: Number,
      required: true,
    },

    periodName: {
      type: String,
      required: true,
    },

    startDate: {
      type: String,
      required: true,
    },

    endDate: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "Open",
        "Closing",
        "Closed",
        "Locked",
      ],
      default: "Open",
    },

    allowPosting: {
      type: Boolean,
      default: true,
    },

    validationStatus: {
      type: String,
      enum: [
        "Not Validated",
        "Passed",
        "Failed",
      ],
      default: "Not Validated",
    },

    validationSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    validationErrors: [
      {
        type: String,
      },
    ],

    validationWarnings: [
      {
        type: String,
      },
    ],

    checklist: {
      trialBalanceBalanced: {
        type: Boolean,
        default: false,
      },

      profitAndLossGenerated: {
        type: Boolean,
        default: false,
      },

      balanceSheetGenerated: {
        type: Boolean,
        default: false,
      },

      allJournalEntriesPosted: {
        type: Boolean,
        default: false,
      },

      noDraftJournals: {
        type: Boolean,
        default: false,
      },

      noUnreconciledBankAccounts: {
        type: Boolean,
        default: false,
      },

      depreciationPosted: {
        type: Boolean,
        default: false,
      },

      closingJournalCreated: {
        type: Boolean,
        default: false,
      },
    },

    closingJournalEntry: {
      type: String,
      default: "",
    },

    retainedEarningsJournal: {
      type: String,
      default: "",
    },

    validatedAt: {
      type: Date,
      default: null,
    },

    validatedBy: {
      type: String,
      default: "",
    },

    closedAt: {
      type: Date,
      default: null,
    },

    closedBy: {
      type: String,
      default: "",
    },

    lockedAt: {
      type: Date,
      default: null,
    },

    lockedBy: {
      type: String,
      default: "",
    },

    reopenedAt: {
      type: Date,
      default: null,
    },

    reopenedBy: {
      type: String,
      default: "",
    },

    reopenedReason: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

accountingPeriodSchema.index(
  {
    fiscalYear: 1,
    periodMonth: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "AccountingPeriod",
  accountingPeriodSchema
);