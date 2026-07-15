const mongoose = require("mongoose");

const PayrollSchema = new mongoose.Schema(
  {
    payrollNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    employeeId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    employeeName: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      trim: true,
    },
    payPeriod: {
      type: String,
      required: true,
      index: true,
    },
    payDate: {
      type: Date,
      default: null,
      index: true,
    },
    payFrequency: {
      type: String,
      enum: ["Weekly", "Fortnightly", "Semi-Monthly", "Monthly", "Annual"],
      default: "Monthly",
    },
    grossPay: {
      type: Number,
      required: true,
      min: 0,
    },
    statutoryIncome: {
      type: Number,
      default: 0,
      min: 0,
    },
    chargeableIncome: {
      type: Number,
      default: 0,
      min: 0,
    },
    nisInsurablePay: {
      type: Number,
      default: 0,
      min: 0,
    },
    deductions: {
      type: Number,
      default: 0,
      min: 0,
    },
    nisEmployee: {
      type: Number,
      default: 0,
      min: 0,
    },
    nhtEmployee: {
      type: Number,
      default: 0,
      min: 0,
    },
    educationTax: {
      type: Number,
      default: 0,
      min: 0,
    },
    incomeTax: {
      type: Number,
      default: 0,
      min: 0,
    },
    pensionEmployee: {
      type: Number,
      default: 0,
      min: 0,
    },
        totalDeductions: {
      type: Number,
      default: 0,
      min: 0,
    },

    netPayBeforeAdvance: {
      type: Number,
      default: 0,
      min: 0,
    },

    advanceRecovery: {
      type: Number,
      default: 0,
      min: 0,
    },

    advanceRecoveries: [
      {
        employeeAdvanceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "EmployeeAdvance",
          required: true,
        },

        advanceNumber: {
          type: String,
          required: true,
          trim: true,
        },

        description: {
          type: String,
          default: "",
          trim: true,
        },

        outstandingBeforeRecovery: {
          type: Number,
          default: 0,
          min: 0,
        },

        amount: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],

    netPay: {
      type: Number,
      required: true,
      min: 0,
    },
    nisEmployer: {
      type: Number,
      default: 0,
      min: 0,
    },
    nhtEmployer: {
      type: Number,
      default: 0,
      min: 0,
    },
    educationTaxEmployer: {
      type: Number,
      default: 0,
      min: 0,
    },
    heartEmployer: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalEmployerContributions: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPayrollCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    statutoryRuleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PayrollStatutoryRule",
      default: null,
    },
    statutoryRuleCode: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    statutoryRuleEffectiveFrom: {
      type: Date,
      default: null,
    },
    statutoryRuleSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    calculationMode: {
      type: String,
      enum: ["Automatic", "Manual", "Legacy"],
      default: "Legacy",
    },
    paidFromAccountNumber: {
      type: String,
      default: "",
      trim: true,
    },
    paidFromAccountName: {
      type: String,
      default: "",
      trim: true,
    },
    journalEntryNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["Draft", "Pending", "Approved", "Paid", "Reversed", "Cancelled"],
      default: "Pending",
      index: true,
    },

        approvedBy: {
      type: String,
      default: "",
      trim: true,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    approvalNotes: {
      type: String,
      default: "",
      trim: true,
    },

    paidBy: {
      type: String,
      default: "",
      trim: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: String,
      default: "",
      trim: true,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      default: "",
      trim: true,
    },
    
    createdBy: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

PayrollSchema.index({ employeeId: 1, payPeriod: 1 });
PayrollSchema.index({ payPeriod: 1, status: 1 });

module.exports = mongoose.model("Payroll", PayrollSchema);