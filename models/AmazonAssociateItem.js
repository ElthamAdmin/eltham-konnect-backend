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

    affiliateLink: {
      type: String,
      required: true,
      trim: true,
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