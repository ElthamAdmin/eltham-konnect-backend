const mongoose = require("mongoose");

const AttendanceLogSchema = new mongoose.Schema(
  {
    attendanceNumber: {
      type: String,
      required: true,
      unique: true,
    },

    userId: {
      type: String,
      required: true,
    },

    fullName: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      default: "",
    },

    workDate: {
      type: String,
      required: true,
    },

    clockInTime: {
      type: Date,
      default: null,
    },

    lunchOutTime: {
      type: Date,
      default: null,
    },

    lunchInTime: {
      type: Date,
      default: null,
    },

    clockOutTime: {
      type: Date,
      default: null,
    },

    lunchMinutes: {
      type: Number,
      default: 0,
    },

    workedMinutes: {
      type: Number,
      default: 0,
    },

    sessionStatus: {
      type: String,
      enum: ["Off Duty", "On Duty", "At Lunch", "Completed"],
      default: "Off Duty",
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AttendanceLog", AttendanceLogSchema);