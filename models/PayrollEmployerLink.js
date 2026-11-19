const mongoose = require("mongoose");

const payrollEmployerLinkSchema = new mongoose.Schema(
  {
    recordType: {
      type: String,
      required: true,
      enum: ["FinancialAccount", "EmployeeAdvance"],
      immutable: true,
    },
    recordId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    recordNumber: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessEntity",
      required: true,
      immutable: true,
    },
    entityCode: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    evidenceReference: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
      immutable: true,
    },
    verifiedByUserId: {
      type: String,
      required: true,
      immutable: true,
    },
    verifiedAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
  },
  { timestamps: true }
);

payrollEmployerLinkSchema.index(
  { recordType: 1, recordId: 1 },
  { unique: true, name: "one_payroll_employer_per_record" }
);

module.exports = mongoose.model(
  "PayrollEmployerLink",
  payrollEmployerLinkSchema
);