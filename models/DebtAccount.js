const mongoose = require("mongoose");

const DebtAccountSchema = new mongoose.Schema(
  {
    debtNumber: { type: String, required: true, unique: true },
    debtName: { type: String, required: true },
    debtType: {
      type: String,
      enum: ["Loan", "Credit Card", "Vehicle Loan", "Equipment Financing", "Business Expansion", "Other"],
      default: "Loan",
    },
    lenderName: { type: String, default: "" },
    startingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    monthlyPayment: { type: Number, default: 0 },
    interestRate: { type: Number, default: 0 },
    dueDay: { type: Number, default: null },
    startDate: { type: String, default: "" },
    targetPayoffDate: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Active", "Paid Off", "Paused"],
      default: "Active",
    },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DebtAccount", DebtAccountSchema);