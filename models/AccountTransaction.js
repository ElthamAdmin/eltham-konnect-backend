const mongoose = require("mongoose");

const accountTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
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

    linkedChartAccountCode: {
      type: String,
      default: "",
      index: true,
    },

    journalEntryNumber: {
      type: String,
      default: "",
      index: true,
    },

    ledgerReference: {
      type: String,
      default: "",
    },

    transactionType: {
      type: String,
      enum: [
        "Deposit",
        "Owner Deposit",
        "Withdrawal",
        "Owner Drawing",
        "Transfer In",
        "Transfer Out",
        "Invoice Payment",
        "Expense Payment",
        "Credit Card Payment",
        "Credit Card Charge",
        "Payroll Payment",
        "Bank Fee",
        "Interest Income",
        "Interest Expense",
        "Adjustment",
      ],
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    paymentMethod: {
      type: String,
      default: "",
    },

    amountTendered: {
      type: Number,
      default: 0,
    },

    changeGiven: {
      type: Number,
      default: 0,
    },

    reference: {
      type: String,
      default: "",
      index: true,
    },

    notes: {
      type: String,
      default: "",
    },

    transactionDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    cleared: {
      type: Boolean,
      default: false,
      index: true,
    },

    clearedDate: {
      type: String,
      default: "",
    },

    reconciled: {
      type: Boolean,
      default: false,
      index: true,
    },

    reconciliationNumber: {
      type: String,
      default: "",
      index: true,
    },

    reconciliationDate: {
      type: String,
      default: "",
    },

    statementDate: {
      type: String,
      default: "",
    },

    reconciledBy: {
      type: String,
      default: "",
    },

    lockedByReconciliation: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "AccountTransaction",
  accountTransactionSchema
);