const mongoose = require("mongoose");

const ReferralSchema = new mongoose.Schema(
  {
    referrerEkonId: {
      type: String,
      required: true,
    },

    referrerName: {
      type: String,
      required: true,
    },

    refereeEkonId: {
      type: String,
      default: "",
    },

    refereeName: {
      type: String,
      default: "",
    },

    referralCode: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["Pending", "Completed"],
      default: "Pending",
    },

    rewardGiven: {
      type: Boolean,
      default: false,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Referral", ReferralSchema);