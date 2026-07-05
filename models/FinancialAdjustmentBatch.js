const mongoose = require("mongoose");

const financialAdjustmentLineSchema = new mongoose.Schema(
  {
    accountNumber: String,
    accountName: String,
    accountType: String,
    linkedChartAccountCode: String,
    currency: { type: String, default: "JMD" },
    exchangeRate: { type: Number, default: 1 },
    ledgerBalance: { type: Number, default: 0 },
    actualBalance: { type: Number, default: 0 },
    ledgerBaseBalance: { type: Number, default: 0 },
    actualBaseBalance: { type: Number, default: 0 },
    difference: { type: Number, default: 0 },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const financialAdjustmentBatchSchema = new mongoose.Schema(
  {
    batchNumber: { type: String, required: true, unique: true, index: true },
    effectiveDate: { type: String, required: true },
    description: { type: String, default: "" },
    adjustmentReason: { type: String, required: true },
    status: {
      type: String,
      enum: ["Draft", "Posted", "Cancelled"],
      default: "Draft",
      index: true,
    },
    lines: [financialAdjustmentLineSchema],
    journalEntryNumber: { type: String, default: "", index: true },
    createdBy: { type: String, default: "System User" },
    postedBy: { type: String, default: "" },
    postedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "FinancialAdjustmentBatch",
  financialAdjustmentBatchSchema
);