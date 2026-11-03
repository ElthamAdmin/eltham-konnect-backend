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

module.exports = mongoose.model("RewardsHubGamePlay", RewardsHubGamePlaySchema);