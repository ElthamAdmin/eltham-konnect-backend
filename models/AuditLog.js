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
      type: Object,
      default: {},
    },

    ipAddress: {
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

module.exports = mongoose.model("AuditLog", AuditLogSchema);