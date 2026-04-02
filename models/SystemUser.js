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
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    role: {
      type: String,
      required: true,
      default: "Support",
      trim: true,
    },

    branch: {
      type: String,
      default: "Eltham Park",
      trim: true,
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },

    permissions: {
      type: [String],
      default: [],
    },

    passwordHash: {
      type: String,
      required: true,
    },

    // 🔗 LINK TO HR EMPLOYEE
    linkedEmployeeId: {
      type: String,
      default: "",
      trim: true,
    },

    // 🔒 OPTIONAL: store employee snapshot (for fast access)
    employeeSnapshot: {
      jobTitle: { type: String, default: "" },
      department: { type: String, default: "" },
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