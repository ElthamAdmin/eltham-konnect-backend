const mongoose = require("mongoose");

const CustomerPushSubscriptionSchema = new mongoose.Schema(
  {
    customerEkonId: {
      type: String,
      required: true,
      index: true,
    },

    endpoint: {
      type: String,
      required: true,
      unique: true,
    },

    keys: {
      p256dh: {
        type: String,
        required: true,
      },
      auth: {
        type: String,
        required: true,
      },
    },

    expirationTime: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "CustomerPushSubscription",
  CustomerPushSubscriptionSchema
);