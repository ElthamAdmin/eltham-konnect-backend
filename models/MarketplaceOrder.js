const mongoose = require("mongoose");

const MarketplaceOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
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
    status: {
      type: String,
      enum: [
        "Pending Review",
        "Awaiting Payment",
        "Paid",
        "Preparing",
        "Ready For Pickup",
        "Delivered",
        "Cancelled",
      ],
      default: "Pending Review",
    },
    customerNote: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MarketplaceOrder", MarketplaceOrderSchema);