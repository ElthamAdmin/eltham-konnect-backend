const mongoose = require("mongoose");

const TeamHubTaskSchema = new mongoose.Schema(
  {
    taskNumber: {
      type: String,
      required: true,
      unique: true,
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamChannel",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    assignedToUserId: {
      type: String,
      default: "",
      index: true,
    },
    assignedToName: {
      type: String,
      default: "",
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    dueDate: {
      type: String,
      default: "",
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ["Not Started", "In Progress", "Completed", "Cancelled"],
      default: "Not Started",
    },
    createdByUserId: {
      type: String,
      required: true,
    },
    createdByName: {
      type: String,
      default: "",
    },
    completedByUserId: {
      type: String,
      default: "",
    },
    completedByName: {
      type: String,
      default: "",
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamHubTask", TeamHubTaskSchema);