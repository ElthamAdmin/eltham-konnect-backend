const mongoose = require("mongoose");

const fiscalYearSchema = new mongoose.Schema(
  {
    fiscalYear: {
      type: Number,
      required: true,
      unique: true,
    },

    yearName: {
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

    totalPeriods: {
      type: Number,
      default: 12,
    },

    closedPeriods: {
      type: Number,
      default: 0,
    },

    isCurrentYear: {
      type: Boolean,
      default: false,
    },

    notes: {
      type: String,
      default: "",
    },

    createdBy: {
      type: String,
      default: "",
    },

    closedBy: {
      type: String,
      default: "",
    },

    lockedBy: {
      type: String,
      default: "",
    },

    closedAt: {
      type: Date,
    },

    lockedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "FiscalYear",
  fiscalYearSchema
);