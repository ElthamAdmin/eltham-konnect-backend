const mongoose = require("mongoose");

const depreciationHistorySchema = new mongoose.Schema(
  {
    period: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    journalEntryNumber: { type: String, default: "" },
    accumulatedDepreciation: {
      type: Number,
      required: true,
      min: 0,
    },
    netBookValue: {
      type: Number,
      required: true,
      min: 0,
    },
    postedAt: { type: Date, required: true },
    postedBy: { type: String, required: true },
  },
  { _id: false }
);

const fixedAssetSchema = new mongoose.Schema(
  {
    assetNumber: {
      type: String,
      required: true,
      unique: true,
    },

        inServiceDate: {
      type: String,
      default: "",
    },

    currency: {
      type: String,
      enum: ["JMD"],
      default: undefined,
    },

    policyVersion: {
      type: String,
      default: undefined,
    },

    entityCode: {
      type: String,
      default: "",
    },

    acquisitionJournalEntryNumber: {
      type: String,
      default: "",
    },

    registrationHash: {
      type: String,
      default: undefined,
    },

    appliedPeriods: {
      type: Number,
      default: 0,
      min: 0,
    },

    depreciationHistory: {
      type: [depreciationHistorySchema],
      default: [],
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