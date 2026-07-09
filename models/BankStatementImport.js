const mongoose = require("mongoose");

const bankStatementLineSchema = new mongoose.Schema(
  {
    lineNumber: {
      type: Number,
      default: 0,
    },

    transactionDate: {
      type: Date,
      required: true,
      index: true,
    },

    description: {
      type: String,
      default: "",
    },

    reference: {
      type: String,
      default: "",
      index: true,
    },

    transactionDirection: {
      type: String,
      enum: ["Deposit", "Withdrawal"],
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    runningBalance: {
      type: Number,
      default: 0,
    },

    matchStatus: {
      type: String,
      enum: ["Unmatched", "Suggested", "Matched", "Duplicate", "Ignored"],
      default: "Unmatched",
      index: true,
    },

    matchedTransactionNumber: {
      type: String,
      default: "",
      index: true,
    },

    matchedJournalEntryNumber: {
      type: String,
      default: "",
    },

    matchConfidence: {
      type: Number,
      default: 0,
    },

    matchingMethod: {
      type: String,
      default: "",
    },

    reviewStatus: {
      type: String,
      enum: ["Pending Review", "Reviewed", "Approved"],
      default: "Pending Review",
    },

    notes: {
      type: String,
      default: "",
    },
  },
  { _id: true }
);

const bankStatementImportSchema = new mongoose.Schema(
  {
    importNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    accountNumber: {
      type: String,
      required: true,
      index: true,
    },

    accountName: {
      type: String,
      required: true,
    },

    statementStartDate: {
      type: String,
      default: "",
    },

    statementDate: {
      type: String,
      required: true,
      index: true,
    },

    statementOpeningBalance: {
      type: Number,
      default: 0,
    },

    statementClosingBalance: {
      type: Number,
      default: 0,
    },

    sourceType: {
      type: String,
      enum: ["Manual", "CSV", "Excel", "OFX", "QBO", "Bank Feed"],
      default: "Manual",
      index: true,
    },

    sourceFileName: {
      type: String,
      default: "",
    },

    totalLines: {
      type: Number,
      default: 0,
    },

    matchedLines: {
      type: Number,
      default: 0,
    },

    suggestedLines: {
      type: Number,
      default: 0,
    },

    unmatchedLines: {
      type: Number,
      default: 0,
    },

    duplicateLines: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["Imported", "Matched", "Partially Matched", "Reviewed", "Archived"],
      default: "Imported",
      index: true,
    },

    importedBy: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
    },

        isSplitMatch: {
      type: Boolean,
      default: false,
      index: true,
    },

    splitMatches: {
      type: [
        {
          transactionNumber: {
            type: String,
            default: "",
            index: true,
          },
          journalEntryNumber: {
            type: String,
            default: "",
          },
          amount: {
            type: Number,
            default: 0,
          },
          transactionType: {
            type: String,
            default: "",
          },
          reference: {
            type: String,
            default: "",
          },
          notes: {
            type: String,
            default: "",
          },
        },
      ],
      default: [],
    },

    splitDifference: {
      type: Number,
      default: 0,
    },

    statementLines: {
      type: [bankStatementLineSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("BankStatementImport", bankStatementImportSchema);