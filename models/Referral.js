const mongoose = require("mongoose");

const ReferralSchema = new mongoose.Schema(
  {
    referralCode: {
      type: String,
      required: true,
    },

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

    status: {
      type: String,
      enum: ["Active", "Pending", "Completed", "Cancelled"],
      default: "Active",
    },

    rewardGiven: {
      type: Boolean,
      default: false,
    },

    firstPackageTrackingNumber: {
      type: String,
      default: "",
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Referral", ReferralSchema);