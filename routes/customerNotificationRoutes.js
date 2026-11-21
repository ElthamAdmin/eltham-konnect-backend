const express = require("express");
const router = express.Router();

const {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  registerPushSubscription,
  removePushSubscription,
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

router.get("/push-public-key", protectCustomer, (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return res.status(503).json({
      success: false,
      message: "Package notifications are not available yet.",
    });
  }

  return res.json({
    success: true,
    publicKey,
  });
});

router.put(
  "/push-subscription",
  protectCustomer,
  registerPushSubscription
);

router.delete(
  "/push-subscription",
  protectCustomer,
  removePushSubscription
);

module.exports = router;