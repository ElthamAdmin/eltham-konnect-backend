const mongoose = require("mongoose");

const fixedAssetSchema = new mongoose.Schema(
  {
    assetNumber: {
      type: String,
      required: true,
      unique: true,
    },

    assetName: {
      type: String,
      required: true,
    },

    assetCategory: {
      type: String,
      enum: [
        "Vehicle",
        "Computer Equipment",
        "Furniture",
        "Office Equipment",
        "Warehouse Equipment",
        "Building",
        "Leasehold Improvement",
        "Other",
      ],
      required: true,
    },

    purchaseDate: {
      type: String,
      required: true,
    },

    purchaseCost: {
      type: Number,
      required: true,
    },

    salvageValue: {
      type: Number,
      default: 0,
    },

    usefulLifeYears: {
      type: Number,
      required: true,
    },

    depreciationMethod: {
      type: String,
      enum: ["Straight Line"],
      default: "Straight Line",
    },

    accumulatedDepreciation: {
      type: Number,
      default: 0,
    },

    annualDepreciation: {
      type: Number,
      default: 0,
    },

    monthlyDepreciation: {
      type: Number,
      default: 0,
    },

    netBookValue: {
      type: Number,
      default: 0,
    },

    assetAccountCode: {
      type: String,
      default: "",
    },

    depreciationExpenseAccountCode: {
      type: String,
      default: "",
    },

    accumulatedDepreciationAccountCode: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "Active",
        "Disposed",
        "Fully Depreciated",
      ],
      default: "Active",
    },

    disposalDate: {
      type: String,
      default: "",
    },

    disposalAmount: {
      type: Number,
      default: 0,
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "FixedAsset",
  fixedAssetSchema
);