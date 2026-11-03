const mongoose = require("mongoose");

const RewardsHubGamePlaySchema = new mongoose.Schema(
  {
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardsHubGame",
      required: true,
    },

    customerEkonId: { type: String, required: true },
    customerName: { type: String, required: true },

    submittedAnswer: { type: String, default: "" },
    isCorrect: { type: Boolean, default: false },

        pointsAwarded: {
      type: Number,
      default: 0,
      min: 0,
    },

    rewardPointsOffered: {
      type: Number,
      default: 0,
      min: 0,
    },

    rewardGiven: { type: Boolean, default: false },
    rewardDate: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RewardsHubGamePlay", RewardsHubGamePlaySchema);