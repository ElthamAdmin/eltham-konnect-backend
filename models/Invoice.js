const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema({
  invoiceNumber: {
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

  packageCount: {
    type: Number,
    default: 0,
  },

  packages: [
    {
      trackingNumber: String,
      chargeableWeight: Number,
      rate: Number,
    },
  ],

  subtotal: {
    type: Number,
    default: 0,
  },

  pointsRedeemed: {
    type: Number,
    default: 0,
  },

  finalTotal: {
    type: Number,
    default: 0,
  },

  status: {
    type: String,
    default: "Unpaid",
  },

  paymentLink: {
    type: String,
    default: "",
  },

  paidDate: {
    type: String,
    default: null,
  },

  paidAt: {
    type: Date,
    default: null,
  },

  createdAt: {
    type: String,
    default: () => new Date().toISOString().split("T")[0],
  },
});

module.exports = mongoose.model("Invoice", InvoiceSchema);