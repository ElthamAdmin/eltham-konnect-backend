const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads/team-hub"));
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage });

const {
  getChannels,
  createChannel,
  getMessages,
  sendMessage,
  sendReply,
  getOrCreateConversation,
} = require("../controllers/teamHubController");

const { protect } = require("../middleware/authMiddleware");

// CHANNELS
router.get("/channels", protect, getChannels);
router.post("/channels", protect, createChannel);

// MESSAGES
router.get("/messages/:channelId", protect, getMessages);
router.post("/messages", protect, upload.array("attachments", 10), sendMessage);
router.post("/messages/reply", protect, upload.array("attachments", 10), sendReply);

// DIRECT CHAT
router.post("/conversation", protect, getOrCreateConversation);

module.exports = router;