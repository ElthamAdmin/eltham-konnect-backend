const express = require("express");
const router = express.Router();

const {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../controllers/customerNotificationController");

const { protect } = require("../middleware/authMiddleware");

router.get("/mine", protect, getMyNotifications);
router.put("/read-all", protect, markAllNotificationsRead);
router.put("/:notificationNumber/read", protect, markNotificationRead);

module.exports = router;