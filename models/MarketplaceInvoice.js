const mongoose = require("mongoose");

const MarketplaceInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    orderNumber: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    customerKey: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    customerName: {
      type: String,
      default: "",
      trim: true,
    },
    customerEkonId: {
      type: String,
      default: "",
      trim: true,
    },
    items: [
      {
        itemNumber: String,
        title: String,
        imageUrl: String,
        category: String,
        sellingPrice: Number,
        quantity: Number,
        lineTotal: Number,
      },
    ],
    subtotal: {
      type: Number,
      default: 0,
    },
    deliveryFee: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    finalTotal: {
      type: Number,
      default: 0,
    },
    paymentLink: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["Unpaid", "Paid", "Cancelled"],
      default: "Unpaid",
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MarketplaceInvoice", MarketplaceInvoiceSchema);