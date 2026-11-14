const mongoose = require("mongoose");

const cleanText = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

const expenseCategorySchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    categoryKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    classification: {
      type: String,
      enum: [
        "Cost of Goods Sold",
        "Operating Expense",
      ],
      required: true,
    },

    group: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    accountCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    accountName: {
      type: String,
      required: true,
      trim: true,
    },

    isCOGS: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
      index: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },

    createdBy: {
      type: String,
      required: true,
      trim: true,
    },

    updatedBy: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  }
);

expenseCategorySchema.pre(
  "validate",
  function () {
    this.category = cleanText(this.category);
    this.categoryKey = this.category.toLowerCase();

    this.group = cleanText(this.group);
    this.accountCode = cleanText(this.accountCode);
    this.accountName = cleanText(this.accountName);

    this.isCOGS =
      this.classification === "Cost of Goods Sold";
  }
);

module.exports = mongoose.model(
  "ExpenseCategory",
  expenseCategorySchema
);