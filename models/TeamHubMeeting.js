const mongoose = require("mongoose");

const TeamHubMeetingSchema = new mongoose.Schema(
  {
    meetingNumber: {
      type: String,
      required: true,
      unique: true,
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamChannel",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    meetingUrl: {
      type: String,
      required: true,
    },
    startedByUserId: {
      type: String,
      required: true,
    },
    startedByName: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Active", "Ended"],
      default: "Active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamHubMeeting", TeamHubMeetingSchema);