const mongoose = require("mongoose");

const MarketplaceProductSchema = new mongoose.Schema(
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
    },
    category: {
      type: String,
      default: "General",
      trim: true,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    costPrice: {
      type: Number,
      default: 0,
    },
    sellingPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    quantityInStock: {
      type: Number,
      default: 0,
    },
    reorderLevel: {
      type: Number,
      default: 2,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Out of Stock"],
      default: "Active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MarketplaceProduct", MarketplaceProductSchema);