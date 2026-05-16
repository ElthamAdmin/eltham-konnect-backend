const mongoose = require("mongoose");

const chartOfAccountSchema = new mongoose.Schema(
  {
    accountCode: {
      type: String,
      required: true,
      unique: true,
    },

    accountName: {
      type: String,
      required: true,
    },

    accountCategory: {
      type: String,
      enum: [
        "Asset",
        "Liability",
        "Equity",
        "Revenue",
        "Cost of Sales",
        "Expense",
      ],
      required: true,
    },

    accountType: {
      type: String,
      default: "",
    },

    parentAccountCode: {
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

    normalBalance: {
      type: String,
      enum: ["Debit", "Credit"],
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    isSystemAccount: {
      type: Boolean,
      default: false,
    },

    allowManualEntries: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "ChartOfAccount",
  chartOfAccountSchema
);