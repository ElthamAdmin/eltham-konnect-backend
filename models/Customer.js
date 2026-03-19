const mongoose = require("mongoose");

const CustomerSchema = new mongoose.Schema(
  {
    ekonId: {
      type: String,
      required: true,
      unique: true,
    },

    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      default: "",
    },

    branch: {
      type: String,
      default: "Eltham Park",
    },

    address: {
      type: String,
      default: "",
    },

    pointsBalance: {
      type: Number,
      default: 0,
      max: 1500,
    },

    lastActivityDate: {
      type: String,
      default: "",
    },

    signUpDate: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      default: "Active",
    },

    passwordHash: {
      type: String,
      default: "",
    },

    termsAccepted: {
      type: Boolean,
      default: false,
    },

    termsAcceptedAt: {
      type: Date,
      default: null,
    },

    privacyAccepted: {
      type: Boolean,
      default: false,
    },

    privacyAcceptedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Customer", CustomerSchema);