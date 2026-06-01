const mongoose = require("mongoose");

const TeamHubNotificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: "TeamChannel" },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "TeamMessage" },
    type: {
      type: String,
      enum: ["Mention", "Announcement", "AddedToChannel", "DirectMessage", "MeetingStarted"],
      required: true,
    },
    title: { type: String, default: "" },
    body: { type: String, default: "" },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamHubNotification", TeamHubNotificationSchema);