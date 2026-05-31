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
  getChannelDocuments,
  uploadChannelDocument,
  getChannelMembers,
  addChannelMember,
  removeChannelMember,
  pinMessage,
  unpinMessage,
  sendAnnouncement,
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
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
router.put("/messages/:messageId/pin", protect, pinMessage);
router.put("/messages/:messageId/unpin", protect, unpinMessage);
router.post("/announcements", protect, upload.array("attachments", 10), sendAnnouncement);

// NOTIFICATIONS
router.get("/notifications/me", protect, getMyNotifications);
router.put("/notifications/:notificationId/read", protect, markNotificationRead);
router.put("/notifications/read-all", protect, markAllNotificationsRead);

// CHANNEL FILES
router.get("/documents/:channelId", protect, getChannelDocuments);
router.post("/documents", protect, upload.single("file"), uploadChannelDocument);

// CHANNEL MEMBERS
router.get("/channels/:channelId/members", protect, getChannelMembers);
router.post("/channels/:channelId/members", protect, addChannelMember);
router.delete("/channels/:channelId/members/:userId", protect, removeChannelMember);

// DIRECT CHAT
router.post("/conversation", protect, getOrCreateConversation);

module.exports = router;