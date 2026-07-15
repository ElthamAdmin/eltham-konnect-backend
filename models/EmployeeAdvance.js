const mongoose = require("mongoose");

const EmployeeAdvanceSchema = new mongoose.Schema(
  {
    advanceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    employeeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    employeeName: {
      type: String,
      required: true,
      trim: true,
    },
    advanceType: {
      type: String,
      enum: ["Cash Advance", "Payment on Behalf", "Salary Advance", "Other"],
      default: "Payment on Behalf",
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    payeeName: {
      type: String,
      default: "",
      trim: true,
    },
    originalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    recoveredAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    outstandingBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    advanceDate: {
      type: Date,
      required: true,
      index: true,
    },
    recoveryStartPeriod: {
      type: String,
      default: "",
      trim: true,
    },
    plannedInstallmentAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentAccountNumber: {
      type: String,
      required: true,
      trim: true,
    },
    paymentAccountName: {
      type: String,
      required: true,
      trim: true,
    },
    fundingJournalEntryNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    fundingTransactionNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["Open", "Partially Recovered", "Recovered", "Cancelled"],
      default: "Open",
      index: true,
    },
    recoveries: [
      {
        recoveryNumber: { type: String, default: "", trim: true },
        payrollNumber: { type: String, default: "", trim: true },
        payPeriod: { type: String, default: "", trim: true },
        amount: { type: Number, default: 0, min: 0 },
        journalEntryNumber: { type: String, default: "", trim: true },
        recoveredAt: { type: Date, default: null },
        recoveredBy: { type: String, default: "", trim: true },
      },
    ],
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    createdBy: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

EmployeeAdvanceSchema.index({ employeeId: 1, status: 1, advanceDate: -1 });

module.exports = mongoose.model("EmployeeAdvance", EmployeeAdvanceSchema);