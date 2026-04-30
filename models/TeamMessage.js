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
    attachments: [{ type: String }],
    mentions: [{ type: String }],
    readBy: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamMessage", TeamMessageSchema);