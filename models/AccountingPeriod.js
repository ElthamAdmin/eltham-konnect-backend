const mongoose = require("mongoose");

const accountingPeriodSchema = new mongoose.Schema(
  {
    periodNumber: {
      type: String,
      required: true,
      unique: true,
    },

    fiscalYear: {
      type: Number,
      required: true,
    },

    periodMonth: {
      type: Number,
      required: true,
    },

    periodName: {
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
      enum: ["Open", "Closed", "Locked"],
      default: "Open",
    },

    closedAt: {
      type: Date,
      default: null,
    },

    closedBy: {
      type: String,
      default: "",
    },

    lockedAt: {
      type: Date,
      default: null,
    },

    lockedBy: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AccountingPeriod", accountingPeriodSchema);