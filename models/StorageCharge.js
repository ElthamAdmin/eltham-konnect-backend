const mongoose = require("mongoose");

const StorageChargeSchema = new mongoose.Schema(
  {
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      required: true,
      immutable: true,
    },

    customerEkonId: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },

    trackingNumberAtCharge: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },

    // Jamaica calendar date for this one chargeable day.
    chargeDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      immutable: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },

    currency: {
      type: String,
      enum: ["JMD"],
      default: "JMD",
      immutable: true,
    },

    policyVersion: {
      type: String,
      required: true,
      immutable: true,
    },

    storageNoticeNumber: {
      type: String,
      required: true,
      immutable: true,
    },

    /*
     * These references will be filled in by the billing
     * workflow when that workflow is implemented.
     */
    invoiceNumber: {
      type: String,
      default: "",
      index: true,
    },

    journalEntryNumber: {
      type: String,
      default: "",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * A package can have only one storage-charge record
 * for a particular calendar day.
 */
StorageChargeSchema.index(
  { packageId: 1, chargeDate: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "StorageCharge",
  StorageChargeSchema
);