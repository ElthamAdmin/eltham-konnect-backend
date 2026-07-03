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

fiscalYearSchema.index(
  {
    fiscalYear: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model("FiscalYear", fiscalYearSchema);