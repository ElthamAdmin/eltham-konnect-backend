const mongoose = require("mongoose");

const posActionLogSchema = new mongoose.Schema(
  {
    actionType: {
      type: String,
      enum: ["Manager Override", "Discount Authorization", "Void", "Refund"],
      required: true,
    },
    invoiceNumber: { type: String, default: "", index: true },
    invoiceType: { type: String, default: "" },
    reason: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    branch: { type: String, default: "", index: true },
    cashierUserId: { type: String, default: "" },
    cashierName: { type: String, default: "" },
    approvedByUserId: { type: String, default: "" },
    approvedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("POSActionLog", posActionLogSchema);