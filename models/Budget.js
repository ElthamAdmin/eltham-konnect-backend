const mongoose = require("mongoose");

const budgetSchema = new mongoose.Schema(
  {
    budgetNumber: {
      type: String,
      required: true,
      unique: true,
    },

    budgetName: {
      type: String,
      required: true,
    },

    budgetYear: {
      type: Number,
      required: true,
    },

    budgetMonth: {
      type: Number,
      required: true,
    },

    category: {
      type: String,
      enum: [
        "Revenue",
        "Payroll",
        "Rent",
        "Utilities",
        "Marketing",
        "Freight",
        "Delivery",
        "Supplies",
        "Debt Repayment",
        "Tax Reserve",
        "Equipment",
        "Other",
      ],
      required: true,
    },

    branch: {
      type: String,
      default: "All Branches",
    },

        costCenter: {
      type: String,
      default: "General",
      index: true,
    },

    linkedChartAccountCode: {
      type: String,
      default: "",
      index: true,
    },

    linkedChartAccountName: {
      type: String,
      default: "",
    },

    budgetType: {
      type: String,
      enum: ["Operating", "Capital", "Cash Flow", "Revenue"],
      default: "Operating",
      index: true,
    },

    frequency: {
      type: String,
      enum: ["Monthly", "Quarterly", "Yearly"],
      default: "Monthly",
    },

    plannedAmount: {
      type: Number,
      required: true,
    },

    actualAmount: {
      type: Number,
      default: 0,
    },

    variance: {
      type: Number,
      default: 0,
    },

    variancePercent: {
      type: Number,
      default: 0,
    },

    notes: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["Active", "Closed"],
      default: "Active",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Budget", budgetSchema);