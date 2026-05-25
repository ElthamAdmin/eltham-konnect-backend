const mongoose = require("mongoose");

const financialAccountSchema = new mongoose.Schema(
  {
    accountNumber: {
      type: String,
      required: true,
      unique: true,
    },

    accountName: {
      type: String,
      required: true,
    },

    accountType: {
      type: String,
      enum: ["Bank", "Cash", "Credit Card"],
      required: true,
    },

    linkedChartAccountCode: {
      type: String,
      default: "",
      index: true,
    },

    bankName: {
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

    currency: {
      type: String,
      default: "JMD",
    },

    exchangeRate: {
  type: Number,
  default: 1,
},

baseCurrency: {
  type: String,
  default: "JMD",
},

baseCurrencyOpeningBalance: {
  type: Number,
  default: 0,
},

baseCurrencyBalance: {
  type: Number,
  default: 0,
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

module.exports = mongoose.model("FinancialAccount", financialAccountSchema);