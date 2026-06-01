const mongoose = require("mongoose");

const MeetingActionItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    assignedToUserId: { type: String, default: "" },
    assignedToName: { type: String, default: "" },
    dueDate: { type: String, default: "" },
    createdTaskId: { type: mongoose.Schema.Types.ObjectId, ref: "TeamHubTask", default: null },
    status: {
      type: String,
      enum: ["Pending", "Converted To Task", "Completed"],
      default: "Pending",
    },
  },
  { _id: true }
);

const TeamHubMeetingSchema = new mongoose.Schema(
  {
    meetingNumber: { type: String, required: true, unique: true },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamChannel",
      required: true,
      index: true,
    },
    linkedCalendarEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamHubCalendarEvent",
      default: null,
    },
    title: { type: String, required: true, trim: true },
    meetingUrl: { type: String, required: true },
    startedByUserId: { type: String, required: true },
    startedByName: { type: String, default: "" },
    notes: { type: String, default: "" },
    decisions: { type: String, default: "" },
    actionItems: [MeetingActionItemSchema],
    status: {
      type: String,
      enum: ["Active", "Ended"],
      default: "Active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamHubMeeting", TeamHubMeetingSchema);