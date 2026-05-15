const mongoose = require("mongoose");

const DebtPaymentSchema = new mongoose.Schema(
  {
    paymentNumber: { type: String, required: true, unique: true },
    debtNumber: { type: String, required: true },
    debtName: { type: String, default: "" },
    amountPaid: { type: Number, required: true },
    paymentDate: { type: String, required: true },
    paidFrom: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DebtPayment", DebtPaymentSchema);