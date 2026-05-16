const mongoose = require("mongoose");

const journalEntryLineSchema = new mongoose.Schema({
  accountCode: {
    type: String,
    required: true,
  },

  accountName: {
    type: String,
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

  description: {
    type: String,
    default: "",
  },
});

const journalEntrySchema = new mongoose.Schema(
  {
    entryNumber: {
      type: String,
      required: true,
      unique: true,
    },

    entryDate: {
      type: String,
      required: true,
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

    totalDebit: {
      type: Number,
      default: 0,
    },

    totalCredit: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["Posted", "Draft", "Reversed"],
      default: "Posted",
    },

    lines: [journalEntryLineSchema],

    createdBy: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "JournalEntry",
  journalEntrySchema
);