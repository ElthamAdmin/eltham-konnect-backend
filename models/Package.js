const mongoose = require("mongoose");

const PackageSchema = new mongoose.Schema({
  trackingNumber: {
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

  courier: {
    type: String,
    default: "",
  },

  weight: {
    type: Number,
    default: 0,
  },

  status: {
    type: String,
    default: "At Warehouse",
  },

  warehouseLocation: {
    type: String,
    default: "",
  },

  invoiceStatus: {
    type: String,
    default: "Pending",
  },

  readyForPickup: {
    type: Boolean,
    default: false,
  },

  readyForPickupDate: {
    type: Date,
    default: null,
  },

  statusUpdatedAt: {
    type: Date,
    default: Date.now,
  },

  dateReceived: {
    type: Date,
    default: Date.now,
  },

  customerInvoiceUploaded: {
    type: Boolean,
    default: false,
  },

  customerInvoiceUploadNumber: {
    type: String,
    default: "",
  },

  customerInvoiceNumber: {
    type: String,
    default: "",
  },

  customerInvoiceFileName: {
    type: String,
    default: "",
  },

  customerInvoiceFilePath: {
    type: String,
    default: "",
  },

  customerInvoiceNotes: {
    type: String,
    default: "",
  },

  customerInvoiceUploadedAt: {
    type: Date,
    default: null,
  },
});

module.exports = mongoose.model("Package", PackageSchema);