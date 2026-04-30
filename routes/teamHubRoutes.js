const express = require("express");
const router = express.Router();

const {
  getChannels,
  createChannel,
  getMessages,
  sendMessage,
  getOrCreateConversation,
} = require("../controllers/teamHubController");

const { protect } = require("../middleware/authMiddleware");

// CHANNELS
router.get("/channels", protect, getChannels);
router.post("/channels", protect, createChannel);

// MESSAGES
router.get("/messages/:channelId", protect, getMessages);
router.post("/messages", protect, sendMessage);

// DIRECT CHAT
router.post("/conversation", protect, getOrCreateConversation);

module.exports = router;