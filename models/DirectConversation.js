const mongoose = require("mongoose");

const DirectConversationSchema = new mongoose.Schema(
  {
    participants: [{ type: String, required: true }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("DirectConversation", DirectConversationSchema);