const mongoose = require("mongoose");

const generalLedgerTransactionSchema = new mongoose.Schema(
  {
    ledgerNumber: {
      type: String,
      required: true,
      unique: true,
    },

    entryNumber: {
      type: String,
      required: true,
    },

    entryDate: {
      type: String,
      required: true,
    },

    accountCode: {
      type: String,
      required: true,
    },

    accountName: {
      type: String,
      required: true,
    },

    accountCategory: {
      type: String,
      default: "",
    },

    normalBalance: {
      type: String,
      enum: ["Debit", "Credit"],
      required: true,
    },

    debit: {
      type: Number,
      default: 0,
    },

    credit: {
      type: Number,
      default: 0,
    },

    runningBalance: {
      type: Number,
      default: 0,
    },

    reference: {
      type: String,
      default: "",
    },

    sourceModule: {
      type: String,
      default: "",
    },

    memo: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "GeneralLedgerTransaction",
  generalLedgerTransactionSchema
);