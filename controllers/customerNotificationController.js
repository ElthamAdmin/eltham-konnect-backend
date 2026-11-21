const CustomerNotification = require("../models/CustomerNotification");
const CustomerPushSubscription = require("../models/CustomerPushSubscription");

const getMyNotifications = async (req, res) => {
  try {
    const customerEkonId = req.user?.ekonId;

    if (!customerEkonId) {
      return res.status(403).json({
        success: false,
        message: "Customer identity not found",
      });
    }

    const notifications = await CustomerNotification.find({
      customerEkonId,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Notifications retrieved successfully",
      totalNotifications: notifications.length,
      unreadCount: notifications.filter((item) => !item.isRead).length,
      data: notifications,
    });
  } catch (error) {
    console.error("Error getting customer notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve notifications",
      error: error.message,
    });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const customerEkonId = req.user?.ekonId;
    const { notificationNumber } = req.params;

    const notification = await CustomerNotification.findOne({
      notificationNumber,
      customerEkonId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    notification.isRead = true;
    await notification.save();

    res.json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    console.error("Error marking notification read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update notification",
      error: error.message,
    });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    const customerEkonId = req.user?.ekonId;

    if (!customerEkonId) {
      return res.status(403).json({
        success: false,
        message: "Customer identity not found",
      });
    }

    const result = await CustomerNotification.updateMany(
      {
        customerEkonId,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
        },
      }
    );

    res.json({
      success: true,
      message: "All notifications marked as read",
      updatedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error("Error marking all notifications read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update notifications",
      error: error.message,
    });
  }
};

function isSupportedPushEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 4096) return false;

  try {
    const url = new URL(endpoint);
    const supportedHost =
      url.hostname === "fcm.googleapis.com" ||
      url.hostname.endsWith(".push.apple.com");

    return (
      supportedHost &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      url.pathname.length > 1
    );
  } catch {
    return false;
  }
}

const registerPushSubscription = async (req, res) => {
  const customerEkonId = req.user?.ekonId;
  if (!customerEkonId) {
    return res.status(403).json({
      success: false,
      message: "Customer identity not found",
    });
  }

  const { endpoint, keys, expirationTime = null } = req.body || {};

  if (!isSupportedPushEndpoint(endpoint)) {
    return res.status(400).json({
      success: false,
      message: "This browser's push service is not supported.",
    });
  }

  const validKeys =
    typeof keys?.p256dh === "string" &&
    /^[A-Za-z0-9_-]{87}$/.test(keys.p256dh) &&
    Buffer.from(keys.p256dh, "base64url")[0] === 4 &&
    typeof keys?.auth === "string" &&
    /^[A-Za-z0-9_-]{22}$/.test(keys.auth);

  if (!validKeys) {
    return res.status(400).json({
      success: false,
      message: "The browser supplied an invalid push subscription.",
    });
  }

  if (
    expirationTime !== null &&
    (!Number.isSafeInteger(expirationTime) ||
      expirationTime <= Date.now() ||
      expirationTime > 8640000000000000)
  ) {
    return res.status(400).json({
      success: false,
      message: "Please renew this device's push subscription.",
    });
  }

  try {
    await CustomerPushSubscription.updateOne(
      { endpoint, customerEkonId },
      {
        $set: {
          keys: { p256dh: keys.p256dh, auth: keys.auth },
          expirationTime: expirationTime === null ? null : new Date(expirationTime),
        },
      },
      { upsert: true, runValidators: true }
    );

    return res.json({ success: true });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Create a fresh subscription for this account on this device.",
      });
    }

    console.error("Could not register customer push subscription:", error.name);
    return res.status(500).json({
      success: false,
      message: "Could not enable package notifications.",
    });
  }
};

const removePushSubscription = async (req, res) => {
  const customerEkonId = req.user?.ekonId;
  if (!customerEkonId) {
    return res.status(403).json({
      success: false,
      message: "Customer identity not found",
    });
  }

  const { endpoint } = req.body || {};
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > 4096) {
    return res.status(400).json({
      success: false,
      message: "A device subscription endpoint is required.",
    });
  }

  try {
    await CustomerPushSubscription.deleteOne({ customerEkonId, endpoint });
    return res.json({ success: true });
  } catch (error) {
    console.error("Could not remove customer push subscription:", error.name);
    return res.status(500).json({
      success: false,
      message: "Could not turn off package notifications.",
    });
  }
};

module.exports = {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  registerPushSubscription,
  removePushSubscription,
};