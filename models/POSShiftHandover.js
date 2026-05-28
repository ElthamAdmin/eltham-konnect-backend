const mongoose = require("mongoose");

const posShiftHandoverSchema = new mongoose.Schema(
  {
    drawerNumber: { type: String, required: true, index: true },
    branch: { type: String, default: "", index: true },
    fromCashierUserId: { type: String, default: "" },
    fromCashierName: { type: String, default: "" },
    toCashierName: { type: String, default: "" },
    expectedCash: { type: Number, default: 0 },
    countedCash: { type: Number, default: 0 },
    variance: { type: Number, default: 0 },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("POSShiftHandover", posShiftHandoverSchema);