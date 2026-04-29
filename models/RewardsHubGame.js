const mongoose = require("mongoose");

const RewardsHubGameSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    instructions: { type: String, required: true },

    gameType: {
      type: String,
      enum: ["Trivia", "Spin Wheel", "Scavenger Hunt", "Match Image", "Scratch Card"],
      required: true,
    },

    question: { type: String, default: "" },
    correctAnswer: { type: String, default: "" },
    options: [{ type: String }],

    rewardText: { type: String, default: "" },
    rewardPoints: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RewardsHubGame", RewardsHubGameSchema);