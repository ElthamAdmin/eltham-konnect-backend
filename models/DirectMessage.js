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

const DirectMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DirectConversation",
      required: true,
      index: true,
    },
    senderId: { type: String, required: true, index: true },
    receiverId: { type: String, required: true, index: true },
    message: { type: String, default: "" },
    attachments: [AttachmentSchema],
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DirectMessage", DirectMessageSchema);