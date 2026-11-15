const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    debtNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },

    creationRequestHash: {
      type: String,
      default: undefined,
      immutable: true,
    },

    debtName: {
      type: String,
      required: true,
      trim: true,
    },

    debtType: {
      type: String,
      enum: [
        "Loan",
        "Credit Card",
        "Vehicle Loan",
        "Equipment Financing",
        "Business Expansion",
        "Other",
      ],
      default: "Loan",
    },

    lenderName: {
      type: String,
      default: "",
      trim: true,
    },

    currency: {
      type: String,
      enum: ["JMD"],
      default: undefined,
    },

    entityCode: {
      type: String,
      default: "",
      trim: true,
    },

    liabilityAccountCode: {
      type: String,
      default: "",
      trim: true,
    },

    interestAccountCode: {
      type: String,
      default: "",
      trim: true,
    },

    startingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    currentBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    monthlyPayment: {
      type: Number,
      default: 0,
      min: 0,
    },

    interestRate: {
      type: Number,
      default: 0,
      min: 0,
    },

    dueDay: {
      type: Number,
      default: null,
      min: 1,
      max: 31,
      validate: {
        validator: (value) =>
          value === null || Number.isInteger(value),
        message: "Due day must be a whole number.",
      },
    },

    startDate: {
      type: String,
      default: "",
    },

    targetPayoffDate: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["Active", "Paid Off", "Paused"],
      default: "Active",
    },

    repaymentVersion: {
      type: Number,
      default: 0,
      min: 0,
    },

    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DebtAccount", schema);