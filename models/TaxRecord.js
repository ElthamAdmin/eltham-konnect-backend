const mongoose = require("mongoose");

const taxRecordSchema = new mongoose.Schema(
  {
    taxNumber: {
      type: String,
      required: true,
      unique: true,
    },

    taxType: {
      type: String,
      enum: [
        "GCT",
        "PAYE",
        "NIS",
        "NHT",
        "Education Tax",
        "Income Tax",
        "Company Tax",
        "Other",
      ],
      required: true,
    },

    periodStart: {
      type: String,
      required: true,
    },

    periodEnd: {
      type: String,
      required: true,
    },

    taxableAmount: {
      type: Number,
      default: 0,
    },

    taxRate: {
      type: Number,
      default: 0,
    },

    taxDue: {
      type: Number,
      default: 0,
    },

    amountPaid: {
      type: Number,
      default: 0,
    },

    balanceDue: {
      type: Number,
      default: 0,
    },

    dueDate: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["Draft", "Filed", "Paid", "Partially Paid", "Overdue"],
      default: "Draft",
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("TaxRecord", taxRecordSchema);