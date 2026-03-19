const mongoose = require("mongoose");

const MarketingCampaignSchema = new mongoose.Schema(
  {
    campaignNumber: {
      type: String,
      required: true,
      unique: true,
    },
    campaignName: {
      type: String,
      required: true,
    },
    channel: {
      type: String,
      required: true,
      default: "WhatsApp",
    },
    audience: {
      type: String,
      default: "All Customers",
    },
    budget: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      default: "Draft",
    },
    startDate: {
      type: String,
      default: "",
    },
    endDate: {
      type: String,
      default: "",
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

module.exports = mongoose.model("MarketingCampaign", MarketingCampaignSchema);