const mongoose = require("mongoose");

const reconciliationItemSchema = new mongoose.Schema(
  {
    transactionNumber: {
      type: String,
      default: "",
      index: true,
    },

    transactionType: {
      type: String,
      default: "",
    },

    transactionDirection: {
      type: String,
      enum: ["Deposit", "Withdrawal"],
      default: "Withdrawal",
    },

    amount: {
      type: Number,
      default: 0,
    },

    transactionDate: {
      type: Date,
      default: Date.now,
    },

    reference: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
    },

    cleared: {
      type: Boolean,
      default: false,
    },

    clearedDate: {
      type: String,
      default: "",
    },

    reconciled: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const bankReconciliationSchema = new mongoose.Schema(
  {
    reconciliationNumber: {
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

    bankStatementBalance: {
      type: Number,
      default: 0,
    },

    systemBalance: {
      type: Number,
      default: 0,
    },

    clearedDeposits: {
      type: Number,
      default: 0,
    },

    clearedWithdrawals: {
      type: Number,
      default: 0,
    },

    outstandingDeposits: {
      type: Number,
      default: 0,
    },

    outstandingWithdrawals: {
      type: Number,
      default: 0,
    },

    adjustedBalance: {
      type: Number,
      default: 0,
    },

    difference: {
      type: Number,
      default: 0,
    },

    reconciledTransactionCount: {
      type: Number,
      default: 0,
    },

    unreconciledTransactionCount: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["Draft", "Balanced", "Out of Balance", "Finalized", "Reopened"],
      default: "Draft",
      index: true,
    },

    locked: {
      type: Boolean,
      default: false,
    },

    notes: {
      type: String,
      default: "",
    },

    reconciliationItems: {
      type: [reconciliationItemSchema],
      default: [],
    },

    startedBy: {
      type: String,
      default: "",
    },

    completedBy: {
      type: String,
      default: "",
    },

    finalizedBy: {
      type: String,
      default: "",
    },

    finalizedAt: {
      type: Date,
      default: null,
    },

    reopenedBy: {
      type: String,
      default: "",
    },

    reopenedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "BankReconciliation",
  bankReconciliationSchema
);