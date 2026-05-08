const mongoose = require("mongoose");

const UnmatchedPackageSchema = new mongoose.Schema(
  {
    unmatchedNumber: {
      type: String,
      required: true,
      unique: true,
    },

    trackingNumber: {
      type: String,
      required: true,
    },

    customerEkonId: {
      type: String,
      default: "",
    },

    customerName: {
      type: String,
      default: "",
    },

    courier: {
      type: String,
      default: "",
    },

    weight: {
      type: Number,
      default: 0,
    },

    warehouseLocation: {
      type: String,
      default: "",
    },

    dateReceived: {
      type: Date,
      default: Date.now,
    },

    externalPackageId: {
      type: String,
      default: "",
    },

    externalWarehouseId: {
      type: String,
      default: "",
    },

    externalStatus: {
      type: String,
      default: "",
    },

    integrationSource: {
      type: String,
      default: "Freight Partner",
    },

    issueReason: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["Pending Review", "Resolved", "Ignored"],
      default: "Pending Review",
    },

    rawPayload: {
      type: Object,
      default: {},
    },

    resolvedCustomerEkonId: {
      type: String,
      default: "",
    },

    resolvedPackageId: {
      type: String,
      default: "",
    },

    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UnmatchedPackage", UnmatchedPackageSchema);