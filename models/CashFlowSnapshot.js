const mongoose = require("mongoose");

const cashFlowSnapshotSchema = new mongoose.Schema(
  {
    snapshotDate: {
      type: String,
      required: true,
    },

    operatingInflows: {
      type: Number,
      default: 0,
    },

    operatingOutflows: {
      type: Number,
      default: 0,
    },

    investingInflows: {
      type: Number,
      default: 0,
    },

    investingOutflows: {
      type: Number,
      default: 0,
    },

    financingInflows: {
      type: Number,
      default: 0,
    },

    financingOutflows: {
      type: Number,
      default: 0,
    },

    netOperatingCashFlow: {
      type: Number,
      default: 0,
    },

    netInvestingCashFlow: {
      type: Number,
      default: 0,
    },

    netFinancingCashFlow: {
      type: Number,
      default: 0,
    },

    openingCashBalance: {
      type: Number,
      default: 0,
    },

    closingCashBalance: {
      type: Number,
      default: 0,
    },

    generatedBy: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "CashFlowSnapshot",
  cashFlowSnapshotSchema
);