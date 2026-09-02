const CustomerNotification = require("../models/CustomerNotification");

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

module.exports = {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};