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
});

module.exports = mongoose.model("Package", PackageSchema);