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