const mongoose = require("mongoose");

const AttachmentSchema = new mongoose.Schema(
  {
    originalName: { type: String, default: "" },
    fileName: { type: String, default: "" },
    fileUrl: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
  },
  { _id: false }
);

const TeamMessageSchema = new mongoose.Schema(
  {
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamChannel",
      default: null,
      index: true,
    },
    parentMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamMessage",
      default: null,
      index: true,
    },
    senderId: { type: String, required: true },
    message: { type: String, default: "" },
    attachments: [AttachmentSchema],
    mentions: [{ type: String }],
    readBy: [{ type: String }],
    reactions: [
      {
        emoji: { type: String, default: "" },
        userId: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamMessage", TeamMessageSchema);