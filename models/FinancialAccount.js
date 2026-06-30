const mongoose = require("mongoose");

const financialAccountSchema = new mongoose.Schema(
  {
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    accountName: {
      type: String,
      required: true,
    },

    accountType: {
      type: String,
      enum: ["Bank", "Cash", "Credit Card"],
      required: true,
      index: true,
    },

    linkedChartAccountCode: {
      type: String,
      default: "",
      index: true,
    },

    bankName: {
      type: String,
      default: "",
    },

    openingBalance: {
      type: Number,
      default: 0,
    },

    currentBalance: {
      type: Number,
      default: 0,
    },

    currency: {
      type: String,
      default: "JMD",
    },

    exchangeRate: {
      type: Number,
      default: 1,
    },

    baseCurrency: {
      type: String,
      default: "JMD",
    },

    baseCurrencyOpeningBalance: {
      type: Number,
      default: 0,
    },

    baseCurrencyBalance: {
      type: Number,
      default: 0,
    },

    lastReconciliationNumber: {
      type: String,
      default: "",
      index: true,
    },

    lastReconciledDate: {
      type: String,
      default: "",
    },

    lastReconciledBalance: {
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

    unreconciledDifference: {
      type: Number,
      default: 0,
    },

    reconciliationStatus: {
      type: String,
      enum: ["Never Reconciled", "In Progress", "Balanced", "Out of Balance"],
      default: "Never Reconciled",
      index: true,
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FinancialAccount", financialAccountSchema);