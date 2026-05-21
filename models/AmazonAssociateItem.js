const mongoose = require("mongoose");

const AmazonAssociateItemSchema = new mongoose.Schema(
  {
    itemNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    imageUrl: {
      type: String,
      default: "",
      trim: true,
    },

    imagePublicId: {
  type: String,
  default: "",
  trim: true,
},

        affiliateLink: {
      type: String,
      default: "",
      trim: true,
    },

    productType: {
      type: String,
      enum: ["Amazon Affiliate", "EK Inventory"],
      default: "Amazon Affiliate",
    },

    category: {
      type: String,
      default: "General",
      trim: true,
    },

    sourceSupplier: {
      type: String,
      default: "",
      trim: true,
    },

    costPrice: {
      type: Number,
      default: 0,
    },

    sellingPrice: {
      type: Number,
      default: 0,
    },

    quantityInStock: {
      type: Number,
      default: 0,
    },

    lowStockAlertLevel: {
      type: Number,
      default: 2,
    },

    unitsSold: {
      type: Number,
      default: 0,
    },

    totalRevenue: {
      type: Number,
      default: 0,
    },

    totalProfit: {
      type: Number,
      default: 0,
    },

    buttonText: {
      type: String,
      default: "Shop on Amazon",
      trim: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AmazonAssociateItem", AmazonAssociateItemSchema);