const mongoose = require("mongoose");

const ExpenseSchema = new mongoose.Schema({
  expenseNumber: {
    type: String,
    required: true,
    unique: true,
  },
  date: {
    type: String,
    required: true,
  },
    category: {
    type: String,
    required: true,
  },

  expenseClassification: {
    type: String,
    enum: ["Cost of Goods Sold", "Operating Expense"],
    default: "Operating Expense",
    index: true,
  },

  expenseGroup: {
    type: String,
    default: "",
    index: true,
  },

  linkedChartAccountCode: {
    type: String,
    default: "",
    index: true,
  },

  linkedChartAccountName: {
    type: String,
    default: "",
  },

  isCOGS: {
    type: Boolean,
    default: false,
    index: true,
  },

    branch: {
    type: String,
    default: "All Branches",
    index: true,
  },

  costCenter: {
    type: String,
    default: "General",
    index: true,
  },

  description: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    default: "Paid",
  },
  paidFromAccountNumber: {
    type: String,
    default: "",
  },
  paidFromAccountName: {
    type: String,
    default: "",
  },
  receiptUrl: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Expense", ExpenseSchema);