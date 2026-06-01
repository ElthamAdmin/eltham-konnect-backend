const mongoose = require("mongoose");

const TeamHubMeetingAttendanceSchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamHubMeeting",
      required: true,
      index: true,
    },

    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamChannel",
      required: true,
      index: true,
    },

    userId: {
      type: String,
      required: true,
      index: true,
    },

    fullName: {
      type: String,
      default: "",
    },

    role: {
      type: String,
      default: "",
    },

    joinTime: {
      type: Date,
      default: Date.now,
    },

    leaveTime: {
      type: Date,
      default: null,
    },

    durationMinutes: {
      type: Number,
      default: 0,
    },

    attendanceStatus: {
      type: String,
      enum: [
        "Joined",
        "Completed",
        "Missed"
      ],
      default: "Joined",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "TeamHubMeetingAttendance",
  TeamHubMeetingAttendanceSchema
);