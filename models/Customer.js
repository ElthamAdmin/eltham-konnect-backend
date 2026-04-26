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

    // =========================
    // REFERRAL SYSTEM (NEW)
    // =========================

    referralCode: {
      type: String,
      unique: true,
    },

    referredByCode: {
      type: String,
      default: "",
    },

    referredByEkonId: {
      type: String,
      default: "",
    },

    referralRewardGiven: {
      type: Boolean,
      default: false,
    },

    // =========================

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

    marketingOptIn: {
      type: Boolean,
      default: true,
    },

    marketingOptOutDate: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// =========================
// AUTO GENERATE REFERRAL CODE
// =========================
CustomerSchema.pre("save", function (next) {
  if (!this.referralCode) {
    this.referralCode =
      "EKR" + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

module.exports = mongoose.model("Customer", CustomerSchema);