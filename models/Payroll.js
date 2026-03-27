const mongoose = require("mongoose");

const PayrollSchema = new mongoose.Schema({
  payrollNumber: {
    type: String,
    required: true,
    unique: true,
  },

  employeeName: {
    type: String,
    required: true,
  },

  role: {
    type: String,
    required: true,
  },

  payPeriod: {
    type: String,
    required: true,
  },

  grossPay: {
    type: Number,
    required: true,
  },

  deductions: {
    type: Number,
    default: 0,
  },

  nisEmployee: {
    type: Number,
    default: 0,
  },

  nhtEmployee: {
    type: Number,
    default: 0,
  },

  educationTax: {
    type: Number,
    default: 0,
  },

  incomeTax: {
    type: Number,
    default: 0,
  },

  pensionEmployee: {
    type: Number,
    default: 0,
  },

  totalDeductions: {
    type: Number,
    default: 0,
  },

  netPay: {
    type: Number,
    required: true,
  },

  // ✅ NEW: Account Payment Tracking
  paidFromAccountNumber: {
    type: String,
    default: "",
  },

  paidFromAccountName: {
    type: String,
    default: "",
  },

  status: {
    type: String,
    default: "Pending",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Payroll", PayrollSchema);