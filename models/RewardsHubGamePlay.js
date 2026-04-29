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

    rewardGiven: { type: Boolean, default: false },
    rewardDate: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RewardsHubGamePlay", RewardsHubGamePlaySchema);