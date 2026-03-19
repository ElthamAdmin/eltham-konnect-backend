const mongoose = require("mongoose");

const financialAccountSchema = new mongoose.Schema({
  accountNumber: {
    type: String,
    required: true,
    unique: true
  },

  accountName: {
    type: String,
    required: true
  },

  accountType: {
    type: String,
    enum: ["Bank", "Cash", "Credit Card"],
    required: true
  },

  bankName: {
    type: String,
    default: ""
  },

  openingBalance: {
    type: Number,
    default: 0
  },

  currentBalance: {
    type: Number,
    default: 0
  },

  currency: {
    type: String,
    default: "JMD"
  },

  status: {
    type: String,
    enum: ["Active", "Inactive"],
    default: "Active"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model("FinancialAccount", financialAccountSchema);