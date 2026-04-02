const mongoose = require("mongoose");

const LEAVE_TYPES = ["Vacation", "Sick", "Unpaid", "Emergency"];
const LEAVE_STATUSES = ["Pending", "Approved", "Rejected", "Cancelled"];

const LeaveRequestSchema = new mongoose.Schema(
  {
    leaveRequestId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    employeeId: {
      type: String,
      required: true,
      trim: true,
    },

    linkedUserId: {
      type: String,
      default: "",
      trim: true,
    },

    employeeName: {
      type: String,
      required: true,
      trim: true,
    },

    department: {
      type: String,
      default: "",
      trim: true,
    },

    branch: {
      type: String,
      default: "",
      trim: true,
    },

    leaveType: {
      type: String,
      enum: LEAVE_TYPES,
      required: true,
    },

    startDate: {
      type: String,
      required: true,
    },

    endDate: {
      type: String,
      required: true,
    },

    totalDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    reason: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: LEAVE_STATUSES,
      default: "Pending",
    },

    adminComment: {
      type: String,
      default: "",
      trim: true,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewedBy: {
      type: String,
      default: "",
      trim: true,
    },

    submittedBy: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("LeaveRequest", LeaveRequestSchema);