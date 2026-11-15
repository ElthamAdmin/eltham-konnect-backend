const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },

    requestHash: {
      type: String,
      default: undefined,
      immutable: true,
    },

    debtNumber: {
      type: String,
      required: true,
      index: true,
    },

    debtName: {
      type: String,
      default: "",
    },

    mode: {
      type: String,
      enum: ["New", "Link"],
      default: undefined,
    },

    currency: {
      type: String,
      enum: ["JMD"],
      default: undefined,
    },

    amountPaid: {
      type: Number,
      required: true,
      min: 0,
    },

    principalAmount: {
      type: Number,
      default: undefined,
      min: 0,
    },

    interestAmount: {
      type: Number,
      default: undefined,
      min: 0,
    },

    paymentDate: {
      type: String,
      required: true,
    },

    paidFrom: {
      type: String,
      default: "",
    },

    paidFromAccountNumber: {
      type: String,
      default: "",
    },

    paymentReference: {
      type: String,
      default: "",
    },

    journalEntryNumber: {
      type: String,
      default: "",
      index: true,
    },

    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DebtPayment", schema);