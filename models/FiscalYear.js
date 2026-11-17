const mongoose = require("mongoose");

const fiscalYearSchema = new mongoose.Schema(
  {
    fiscalYear: {
      type: Number,
      required: true,
      unique: true,
    },

    yearName: {
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
      enum: ["Open", "Closing", "Closed", "Locked"],
      default: "Open",
    },

    allowPosting: {
      type: Boolean,
      default: true,
    },

    totalPeriods: {
      type: Number,
      default: 12,
    },

    closedPeriods: {
      type: Number,
      default: 0,
    },

    openPeriods: {
      type: Number,
      default: 0,
    },

    lockedPeriods: {
      type: Number,
      default: 0,
    },

    isCurrentYear: {
      type: Boolean,
      default: false,
    },

    validationStatus: {
      type: String,
      enum: ["Not Validated", "Passed", "Failed"],
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

    yearEndCompleted: {
      type: Boolean,
      default: false,
    },

    yearEndCompletedAt: {
      type: Date,
      default: null,
    },

    yearEndCompletedBy: {
      type: String,
      default: "",
    },

    nextFiscalYear: {
      type: Number,
      default: null,
    },

    previousFiscalYear: {
      type: Number,
      default: null,
    },

    openingJournalEntry: {
      type: String,
      default: "",
    },

    closingJournalEntry: {
      type: String,
      default: "",
    },

    retainedEarningsJournal: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
    },

    createdBy: {
      type: String,
      default: "",
    },

    validatedBy: {
      type: String,
      default: "",
    },

    closedBy: {
      type: String,
      default: "",
    },

    lockedBy: {
      type: String,
      default: "",
    },

    validatedAt: {
      type: Date,
      default: null,
    },

    closedAt: {
      type: Date,
      default: null,
    },

    lockedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// fiscalYear already has a unique index declared on its field.

fiscalYearSchema.add({
  controlRevision: {
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

fiscalYearSchema.pre("validate", function () {
  const year = Number(this.fiscalYear);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    this.invalidate("fiscalYear", "Enter a year from 2000 to 2100.");
    return;
  }

  if (this.startDate !== `${year}-01-01`) {
    this.invalidate(
      "startDate",
      "This accounting engine requires January 1 as the year start."
    );
  }

  if (this.endDate !== `${year}-12-31`) {
    this.invalidate(
      "endDate",
      "This accounting engine requires December 31 as the year end."
    );
  }

  if (this.totalPeriods !== 12) {
    this.invalidate("totalPeriods", "A fiscal year must contain 12 months.");
  }

  if (this.status !== "Open" && this.allowPosting !== false) {
    this.invalidate(
      "allowPosting",
      "Only an Open fiscal year may allow posting."
    );
  }
});

module.exports = mongoose.model("FiscalYear", fiscalYearSchema);