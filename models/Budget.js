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
      trim: true,
    },

    entityCode: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
      index: true,
    },

    currency: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },

    budgetYear: {
      type: Number,
      required: true,
      min: 2000,
      max: 2100,
    },

    budgetMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
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
      trim: true,
    },

    costCenter: {
      type: String,
      default: "General",
      index: true,
    },

    linkedChartAccountCode: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    linkedChartAccountName: {
      type: String,
      default: "",
    },

    budgetType: {
      type: String,
      enum: [
        "Operating",
        "Capital",
        "Cash Flow",
        "Revenue",
      ],
      default: "Operating",
      index: true,
    },

    frequency: {
      type: String,
      enum: [
        "Monthly",
        "Quarterly",
        "Yearly",
      ],
      default: "Monthly",
    },

    plannedAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Retained for compatibility with older records.
    // Reports derive current actuals from the ledger.
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
      trim: true,
    },

    status: {
      type: String,
      enum: ["Active", "Closed"],
      default: "Active",
    },
  },
  { timestamps: true }
);

budgetSchema.index({
  entityCode: 1,
  budgetYear: 1,
  budgetMonth: 1,
  frequency: 1,
});

budgetSchema.pre("validate", function () {
  if (
    !Number.isInteger(this.budgetYear) ||
    !Number.isInteger(this.budgetMonth)
  ) {
    throw new Error(
      "Budget year and starting month must be whole numbers."
    );
  }

  if (
    !Number.isFinite(this.plannedAmount) ||
    this.plannedAmount < 0 ||
    !Number.isSafeInteger(
      Math.round(this.plannedAmount * 100)
    )
  ) {
    throw new Error(
      "Planned amount must be a valid nonnegative monetary amount."
    );
  }

  this.plannedAmount =
    Math.round(this.plannedAmount * 100) / 100;
});

module.exports = mongoose.model(
  "Budget",
  budgetSchema
);