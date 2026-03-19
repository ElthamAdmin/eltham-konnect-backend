const mongoose = require("mongoose");

const SystemUserSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
    },

    fullName: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    phone: {
      type: String,
      default: "",
    },

    role: {
      type: String,
      required: true,
      default: "Support",
    },

    branch: {
      type: String,
      default: "Eltham Park",
    },

    status: {
      type: String,
      default: "Active",
    },

    permissions: {
      type: [String],
      default: [],
    },

    passwordHash: {
      type: String,
      required: true,
      default: "ChangeMe123!",
    },

    dutyStatus: {
      type: String,
      enum: ["Off Duty", "On Duty", "At Lunch"],
      default: "Off Duty",
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    lastLogoutAt: {
      type: Date,
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SystemUser", SystemUserSchema);