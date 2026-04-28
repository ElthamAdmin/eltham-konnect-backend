const mongoose = require("mongoose");

const RewardsHubEntrySchema = new mongoose.Schema(
  {
    rewardsHubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardsHub",
      required: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    customerName: {
      type: String,
      required: true,
    },

    customerEkonId: {
      type: String,
      required: true,
    },

    actionType: {
      type: String,
      enum: ["Entered", "Claimed"],
      default: "Entered",
    },

    hasWon: {
      type: Boolean,
      default: false,
    },

    isWinner: {
      type: Boolean,
      default: false,
    },

    winDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RewardsHubEntry", RewardsHubEntrySchema);