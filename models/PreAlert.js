const mongoose = require("mongoose");

const PreAlertSchema = new mongoose.Schema(
  {
    preAlertNumber: {
      type: String,
      required: true,
      unique: true,
    },

    customerEkonId: {
      type: String,
      required: true,
    },

    customerName: {
      type: String,
      required: true,
    },

    trackingNumber: {
      type: String,
      required: true,
    },

    courier: {
      type: String,
      default: "",
    },

    storeName: {
      type: String,
      default: "",
    },

    itemDescription: {
      type: String,
      default: "",
    },

    estimatedWeight: {
      type: Number,
      default: 0,
    },

    notes: {
      type: String,
      default: "",
    },

    invoiceFileName: {
      type: String,
      default: "",
    },

    invoiceFilePath: {
      type: String,
      default: "",
    },

        invoiceStorageProvider: {
      type: String,
      default: "",
    },

    invoiceCloudinaryPublicId: {
      type: String,
      default: "",
    },

    invoiceMimeType: {
      type: String,
      default: "",
    },

    invoiceFileSize: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      default: "Submitted",
    },

    date: {
      type: String,
      default: () => new Date().toISOString().split("T")[0],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PreAlert", PreAlertSchema);