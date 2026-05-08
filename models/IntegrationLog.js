const mongoose = require("mongoose");

const IntegrationLogSchema = new mongoose.Schema(
  {
    logNumber: {
      type: String,
      required: true,
      unique: true,
    },

    source: {
      type: String,
      default: "Freight Partner",
    },

    eventType: {
      type: String,
      default: "PACKAGE_ARRIVAL",
    },

    status: {
      type: String,
      enum: ["Success", "Failed", "Duplicate"],
      default: "Success",
    },

    trackingNumber: {
      type: String,
      default: "",
    },

    customerEkonId: {
      type: String,
      default: "",
    },

    message: {
      type: String,
      default: "",
    },

    payload: {
      type: Object,
      default: {},
    },

    errorDetails: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("IntegrationLog", IntegrationLogSchema);