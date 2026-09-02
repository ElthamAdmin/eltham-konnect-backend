const express = require("express");
const router = express.Router();

const {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../controllers/customerNotificationController");

const {
  protectCustomer,
} = require("../middleware/customerAuthMiddleware");

router.get(
  "/mine",
  protectCustomer,
  getMyNotifications
);

router.put(
  "/read-all",
  protectCustomer,
  markAllNotificationsRead
);

router.put(
  "/:notificationNumber/read",
  protectCustomer,
  markNotificationRead
);

module.exports = router;