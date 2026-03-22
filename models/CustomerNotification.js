const mongoose = require("mongoose");

const CustomerNotificationSchema = new mongoose.Schema(
  {
    notificationNumber: {
      type: String,
      required: true,
      unique: true,
    },

    customerEkonId: {
      type: String,
      required: true,
    },

    customerName: {
      type: String,
      required: true,
      default: "",
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      default: "General",
    },

    referenceType: {
      type: String,
      default: "",
    },

    referenceId: {
      type: String,
      default: "",
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    date: {
      type: String,
      default: () => {
        const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Jamaica",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        return formatter.format(new Date());
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("CustomerNotification", CustomerNotificationSchema);