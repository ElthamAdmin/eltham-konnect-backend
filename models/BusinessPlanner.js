const mongoose = require("mongoose");

const BusinessPlannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: [
        "5-Year Goal",
        "To-Do Task",
        "Hiring Plan",
        "Compliance",
        "LLC Transition",
        "Giveaway / Promotion",
        "Business Decision",
        "Financial Strategy",
        "Operations",
      ],
      default: "To-Do Task",
    },

    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },

    status: {
      type: String,
      enum: ["Planned", "In Progress", "Completed", "On Hold", "Cancelled"],
      default: "Planned",
    },

    targetYear: {
      type: Number,
      default: new Date().getFullYear(),
    },

    dueDate: {
      type: Date,
    },

    branch: {
      type: String,
      default: "All Branches",
      trim: true,
    },

    estimatedCost: {
      type: Number,
      default: 0,
    },

    expectedBenefit: {
      type: String,
      default: "",
      trim: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    advisorNote: {
      type: String,
      default: "",
      trim: true,
    },

    createdBy: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BusinessPlanner", BusinessPlannerSchema);