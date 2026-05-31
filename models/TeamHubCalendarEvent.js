const mongoose = require("mongoose");

const TeamHubCalendarEventSchema = new mongoose.Schema(
  {
    eventNumber: {
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
    description: {
      type: String,
      default: "",
      trim: true,
    },
    eventType: {
      type: String,
      enum: ["Meeting", "Deadline", "Event", "Staff Schedule"],
      default: "Event",
    },
    startDate: {
      type: String,
      required: true,
    },
    startTime: {
      type: String,
      default: "",
    },
    endDate: {
      type: String,
      default: "",
    },
    endTime: {
      type: String,
      default: "",
    },
    location: {
      type: String,
      default: "",
    },
    attendees: [
      {
        userId: { type: String, default: "" },
        fullName: { type: String, default: "" },
      },
    ],
    status: {
      type: String,
      enum: ["Scheduled", "Completed", "Cancelled"],
      default: "Scheduled",
    },
    createdByUserId: {
      type: String,
      required: true,
    },
    createdByName: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "TeamHubCalendarEvent",
  TeamHubCalendarEventSchema
);