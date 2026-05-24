const mongoose = require("mongoose");

const MarketplaceCartSchema = new mongoose.Schema(
  {
    customerKey: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    items: [
      {
        itemNumber: String,
        title: String,
        imageUrl: String,
        category: String,
        sellingPrice: {
          type: Number,
          default: 0,
        },
        quantity: {
          type: Number,
          default: 1,
        },
        lineTotal: {
          type: Number,
          default: 0,
        },
      },
    ],
    subtotal: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MarketplaceCart", MarketplaceCartSchema);