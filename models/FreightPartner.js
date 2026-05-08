const mongoose = require("mongoose");

const FreightPartnerSchema = new mongoose.Schema(
  {
    partnerNumber: {
      type: String,
      required: true,
      unique: true,
    },

    partnerName: {
      type: String,
      required: true,
    },

    apiKey: {
      type: String,
      required: true,
      unique: true,
    },

    contactPerson: {
      type: String,
      default: "",
    },

    contactEmail: {
      type: String,
      default: "",
    },

    contactPhone: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },

    notes: {
      type: String,
      default: "",
    },

    lastSyncAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FreightPartner", FreightPartnerSchema);