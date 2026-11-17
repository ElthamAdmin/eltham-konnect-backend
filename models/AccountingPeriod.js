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

// Posting and period changes touch the same document inside transactions.
accountingPeriodSchema.add({
  postingRevision: {
    type: Number,
    default: 0,
  },

  controlHistory: [
    {
      _id: false,
      action: { type: String, required: true },
      at: { type: Date, required: true },
      by: { type: String, required: true },
      reason: { type: String, default: "" },
      previousStatus: { type: String, default: "" },
      newStatus: { type: String, default: "" },
    },
  ],
});

// Unknown is different from a verified pass.
accountingPeriodSchema
  .path("checklist.noUnreconciledBankAccounts")
  .default(null);

accountingPeriodSchema
  .path("checklist.depreciationPosted")
  .default(null);

accountingPeriodSchema.pre("validate", function () {
  const year = Number(this.fiscalYear);
  const month = Number(this.periodMonth);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    this.invalidate("fiscalYear", "Enter a year from 2000 to 2100.");
    return;
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    this.invalidate("periodMonth", "Enter a month from 1 to 12.");
    return;
  }

  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  if (this.startDate !== `${prefix}-01`) {
    this.invalidate(
      "startDate",
      "The period must start on the first day of its selected month."
    );
  }

  if (this.endDate !== `${prefix}-${lastDay}`) {
    this.invalidate(
      "endDate",
      "The period must end on the last day of its selected month."
    );
  }

  if (
    this.status !== "Open" &&
    this.allowPosting !== false
  ) {
    this.invalidate(
      "allowPosting",
      "Only an Open period may allow posting."
    );
  }
});

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