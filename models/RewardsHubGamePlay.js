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

        // Each new play gets its own attempt ID.
    // Retrying the same submission must not create another play.
    // Older records do not need this field.
    attemptId: {
      type: String,
      maxlength: 100,
      validate: {
        validator: (value) =>
          value == null ||
          (
            typeof value === "string" &&
            /^[a-zA-Z0-9_-]{16,100}$/.test(value)
          ),
        message: "A valid game attempt ID is required.",
      },
    },

    // Game score is not redeemable EK Points.
    // Only the backend calculates the score for a play.
    scoreEarned: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Game score must be a whole number.",
      },
    },

    // Legacy records retain their existing meaning.
    // Practice plays can earn game score but cannot award prizes.
    playMode: {
      type: String,
      enum: ["Legacy", "Standard", "Practice"],
      default: "Legacy",
    },

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

        // Written by the backend after selecting a game outcome.
    // Existing plays do not need an outcome or migration.
    outcome: {
      type: new mongoose.Schema(
        {
                    prizeType: {
            type: String,
            enum: [
              "Points",
              "Gift Card",
              "Phone Credit",
              "Other",
              "No Prize",
            ],
          },
          fulfilmentStatus: {
            type: String,
            enum: [
              "Not Required",
              "Pending",
              "Delivered",
            ],
          },
          
          segmentId: {
            type: String,
            default: "",
            maxlength: 50,
          },
          segmentIndex: {
            type: Number,
            min: 0,
            max: 11,
            validate: {
              validator: Number.isSafeInteger,
              message: "Segment index must be a whole number.",
            },
          },
          label: {
            type: String,
            required: true,
            maxlength: 120,
          },
          points: {
            type: Number,
            required: true,
            min: 0,
            max: 1500,
            validate: {
              validator: Number.isSafeInteger,
              message: "Prize points must be a whole number.",
            },
          },
        },
        { _id: false }
      ),
      default: undefined,
    },

    rewardGiven: { type: Boolean, default: false },
    rewardDate: { type: Date, default: null },
  },
  { timestamps: true }
);

// One record per attempt, while allowing multiple attempts
// for the same customer and game.
// Existing records without attemptId are excluded.
RewardsHubGamePlaySchema.index(
  {
    gameId: 1,
    customerEkonId: 1,
    attemptId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      attemptId: { $type: "string" },
    },
  }
);

module.exports = mongoose.model("RewardsHubGamePlay", RewardsHubGamePlaySchema);