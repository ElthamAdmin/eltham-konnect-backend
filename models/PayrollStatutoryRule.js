const mongoose = require("mongoose");

const PayrollStatutoryRuleSchema = new mongoose.Schema(
  {
    ruleCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    countryCode: {
      type: String,
      default: "JM",
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      index: true,
    },
    effectiveTo: {
      type: Date,
      default: null,
      index: true,
    },
    employeeRates: {
      nis: { type: Number, required: true, min: 0 },
      nht: { type: Number, required: true, min: 0 },
      educationTax: { type: Number, required: true, min: 0 },
    },
    employerRates: {
      nis: { type: Number, required: true, min: 0 },
      nht: { type: Number, required: true, min: 0 },
      educationTax: { type: Number, required: true, min: 0 },
      heart: { type: Number, required: true, min: 0 },
    },
    nisAnnualWageCeiling: {
      type: Number,
      required: true,
      min: 0,
    },
    payeThresholds: {
      annual: { type: Number, required: true, min: 0 },
      monthly: { type: Number, required: true, min: 0 },
      fortnightly: { type: Number, required: true, min: 0 },
      weekly: { type: Number, required: true, min: 0 },
    },
    payeRates: {
      standard: { type: Number, required: true, min: 0 },
      upper: { type: Number, required: true, min: 0 },
      upperBandAnnualIncome: { type: Number, required: true, min: 0 },
    },
    calculationSettings: {
      deductNisFromStatutoryIncome: { type: Boolean, default: true },
      deductApprovedPensionFromStatutoryIncome: {
        type: Boolean,
        default: true,
      },
      educationTaxUsesStatutoryIncome: { type: Boolean, default: true },
      nhtUsesGrossPay: { type: Boolean, default: true },
      heartUsesGrossPay: { type: Boolean, default: true },
    },
    sourceNotes: {
      type: String,
      default: "",
      trim: true,
    },
    sourceUrls: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["Draft", "Active", "Inactive"],
      default: "Active",
      index: true,
    },
    createdBy: {
      type: String,
      default: "System",
      trim: true,
    },
    updatedBy: {
      type: String,
      default: "System",
      trim: true,
    },
  },
  { timestamps: true }
);

PayrollStatutoryRuleSchema.index({
  countryCode: 1,
  status: 1,
  effectiveFrom: -1,
});

module.exports = mongoose.model(
  "PayrollStatutoryRule",
  PayrollStatutoryRuleSchema
);