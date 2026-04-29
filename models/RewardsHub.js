const mongoose = require("mongoose");

const RewardsHubSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: ["Giveaway", "Gift Card", "Amazon Link", "Game", "Promotion", "Customer Update"],
      default: "Promotion",
    },

    rewardText: {
      type: String,
      default: "",
    },

    // ⭐ NEW
    rewardPoints: {
      type: Number,
      default: 0,
    },

    externalLink: {
      type: String,
      default: "",
    },

    imageFileName: {
      type: String,
      default: "",
    },

    imageFilePath: {
      type: String,
      default: "",
    },

    startDate: {
      type: Date,
      default: null,
    },

    endDate: {
      type: Date,
      default: null,
    },

    postedByName: {
      type: String,
      default: "System User",
    },

    postedByRole: {
      type: String,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RewardsHub", RewardsHubSchema);