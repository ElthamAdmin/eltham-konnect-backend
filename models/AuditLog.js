const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    auditNumber: {
      type: String,
      required: true,
      unique: true,
    },

    action: {
      type: String,
      required: true,
    },

    module: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    performedByUserId: {
      type: String,
      default: "",
    },

    performedByName: {
      type: String,
      default: "System",
    },

    performedByRole: {
      type: String,
      default: "",
    },

    targetType: {
      type: String,
      default: "",
    },

    targetId: {
      type: String,
      default: "",
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    beforeValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    afterValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    financeReference: {
      type: String,
      default: "",
    },

    journalEntryNumber: {
      type: String,
      default: "",
    },

    ledgerNumber: {
      type: String,
      default: "",
    },

    accountingPeriod: {
      type: String,
      default: "",
    },

    fiscalYear: {
      type: Number,
      default: null,
    },

    accountNumber: {
      type: String,
      default: "",
    },

    accountName: {
      type: String,
      default: "",
    },

    reconciliationNumber: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["Success", "Failed"],
      default: "Success",
    },

    ipAddress: {
      type: String,
      default: "",
    },

    browser: {
      type: String,
      default: "",
    },

    device: {
      type: String,
      default: "",
    },

    requestMethod: {
      type: String,
      default: "",
    },

    requestUrl: {
      type: String,
      default: "",
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ module: 1, action: 1 });
AuditLogSchema.index({ journalEntryNumber: 1 });
AuditLogSchema.index({ fiscalYear: 1 });
AuditLogSchema.index({ accountingPeriod: 1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);