const mongoose = require("mongoose");

const TeamMessageSchema = new mongoose.Schema(
  {
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamChannel",
      default: null,
    },
    senderId: { type: String, required: true },
    message: { type: String, default: "" },
    attachments: [
  {
    originalName: { type: String, default: "" },
    fileName: { type: String, default: "" },
    fileUrl: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
  },
],
    mentions: [{ type: String }],
    readBy: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamMessage", TeamMessageSchema);