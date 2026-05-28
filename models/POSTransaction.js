const mongoose = require("mongoose");

const posTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: { type: String, required: true, unique: true },
    invoiceType: {
      type: String,
      enum: ["Shipping", "Marketplace"],
      required: true,
    },
    invoiceNumber: { type: String, required: true, index: true },
    customerName: { type: String, default: "" },
    customerEkonId: { type: String, default: "" },
    amountPaid: { type: Number, default: 0 },
    amountTendered: { type: Number, default: 0 },
    changeGiven: { type: Number, default: 0 },
    paymentMethod: {
      type: String,
      enum: ["Cash", "Card", "Bank Transfer", "Other"],
      default: "Cash",
    },
    paidIntoAccountNumber: { type: String, default: "" },
    paidIntoAccountName: { type: String, default: "" },
    cashierUserId: { type: String, default: "" },
    cashierName: { type: String, default: "" },
    drawerNumber: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("POSTransaction", posTransactionSchema);