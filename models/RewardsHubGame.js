const mongoose = require("mongoose");

const RewardsHubGameSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    instructions: { type: String, required: true },

    gameType: {
      type: String,
      enum: [
        "Trivia",
        "Spin Wheel",
        "Scavenger Hunt",
        "Match Image",
        "Scratch Card",
        "Sudoku",
        "Snake",
        "Find-a-Word",
        "Chess",
        "Crossword",
      ],
      required: true,
    },

    // Existing games retain their current format.
    question: { type: String, default: "" },
    correctAnswer: { type: String, default: "" },
    options: [{ type: String }],

    // Version 1: existing games.
    // Version 2: interactive games with server validation.
    engineVersion: {
      type: Number,
      enum: [1, 2],
      default: 1,
    },

    // Boards, clues and settings safe to send to the player.
    publicConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },

    // Solutions and validation settings are excluded from
    // ordinary queries. Only the game engine should select them.
    privateConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
      select: false,
    },

    rewardText: { type: String, default: "" },

    rewardPoints: {
      type: Number,
      default: 0,
      min: 0,
      max: 1500,
      validate: {
        validator: Number.isSafeInteger,
        message: "Reward points must be a whole number.",
      },
    },

        // Playing and earning game score are separate from rewards.
    // Existing games keep rewards enabled with a once-per-game limit.
    rewardsEnabled: {
      type: Boolean,
      default: true,
    },

    rewardFrequency: {
      type: String,
      enum: ["Once Per Game", "Daily"],
      default: "Once Per Game",
    },

    // Daily reward limits use Jamaica calendar dates.
    rewardTimeZone: {
      type: String,
      enum: ["America/Jamaica"],
      default: "America/Jamaica",
    },

    // Separate from redeemable EK Points.
    // The backend awards this score only for a validated success.
    scorePerSuccess: {
      type: Number,
      default: 100,
      min: 0,
      max: 10000,
      validate: {
        validator: Number.isSafeInteger,
        message:
          "Game score must be a whole number from 0 to 10,000.",
      },
    },


    isActive: { type: Boolean, default: true },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "RewardsHubGame",
  RewardsHubGameSchema
);