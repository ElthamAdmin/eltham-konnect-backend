const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      index: true,
    },
    journalEntryNumber: {
      type: String,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    recordedBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ARRecoveryLink", schema);