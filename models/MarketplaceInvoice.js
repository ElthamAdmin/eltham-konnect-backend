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
        prePosDiscountTotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    posDiscountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    posDiscountReason: {
      type: String,
      default: "",
      trim: true,
    },

    posDiscountApprovedBy: {
      type: String,
      default: "",
      trim: true,
    },

    posDiscountApprovedByUserId: {
      type: String,
      default: "",
      trim: true,
    },

    posDiscountAppliedAt: {
      type: Date,
      default: null,
    },

    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    balanceDue: {
      type: Number,
      default: 0,
      min: 0,
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
            enum: [
        "Unpaid",
        "Partially Paid",
        "Paid",
        "Cancelled",
      ],
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