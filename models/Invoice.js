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

  subtotal: Number,

  pointsRedeemed: {
    type: Number,
    default: 0,
  },

  finalTotal: Number,

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

  createdAt: {
    type: String,
  },
});

module.exports = mongoose.model("Invoice", InvoiceSchema);