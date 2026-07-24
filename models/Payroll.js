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

        compensationType: {
      type: String,
      enum: [
        "Salary",
        "Wage",
        "Stipend",
        "Allowance",
        "Other",
      ],
      default: "Salary",
      index: true,
    },

    /*
     * H2 controlled compensation snapshot.
     *
     * Existing payroll records remain Legacy.
     * New employee payroll records will preserve the exact
     * effective-dated compensation record used in calculation.
     */
    compensationSource: {
      type: String,
      enum: [
        "Compensation History",
        "Manual",
        "Legacy",
      ],
      default: "Legacy",
      index: true,
    },

    compensationRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployeeCompensation",
      default: null,
      index: true,
    },

    compensationNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    compensationCategory: {
      type: String,
      enum: [
        "Base Pay",
        "Allowance",
        "Supplemental Pay",
        "",
      ],
      default: "",
    },

    compensationComponentCode: {
      type: String,
      default: "",
      trim: true,
    },

    compensationComponentName: {
      type: String,
      default: "",
      trim: true,
    },

    compensationAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    compensationCurrency: {
      type: String,
      default: "JMD",
      trim: true,
    },

    compensationRateUnit: {
      type: String,
      enum: [
        "Hourly",
        "Daily",
        "Weekly",
        "Fortnightly",
        "Semi-Monthly",
        "Monthly",
        "Annual",
        "",
      ],
      default: "",
    },

    compensationEffectiveFrom: {
      type: Date,
      default: null,
    },

    compensationEffectiveTo: {
      type: Date,
      default: null,
    },

    compensationResolvedAsOf: {
      type: Date,
      default: null,
    },

    statutoryTreatment: {
      type: String,
      enum: [
        "Standard",
        "Employer-Assisted Net Pay",
        "Documented Exemption",
      ],
      default: "Standard",
      index: true,
    },

    applyEmployeeStatutoryDeductions: {
      type: Boolean,
      default: true,
    },

    applyEmployerStatutoryContributions: {
      type: Boolean,
      default: true,
    },

    targetNetPay: {
      type: Number,
      default: 0,
      min: 0,
    },

    employerSupportAllowance: {
      type: Number,
      default: 0,
      min: 0,
    },

    statutoryExemption: {
      reason: {
        type: String,
        default: "",
        trim: true,
      },

      legalBasis: {
        type: String,
        default: "",
        trim: true,
      },

      supportingReference: {
        type: String,
        default: "",
        trim: true,
      },

      supportingDocumentUrl: {
        type: String,
        default: "",
        trim: true,
      },

      effectiveFrom: {
        type: Date,
        default: null,
      },

      effectiveTo: {
        type: Date,
        default: null,
      },

      authorizedBy: {
        type: String,
        default: "",
        trim: true,
      },

      authorizedAt: {
        type: Date,
        default: null,
      },
    },

        minimumWageAssessment: {
      applicable: {
        type: Boolean,
        default: true,
      },

      workerCategory: {
        type: String,
        enum: [
          "General",
          "Industrial Security Guard",
          "Other",
        ],
        default: "General",
      },

      hourlyRate: {
        type: Number,
        default: 0,
        min: 0,
      },

      weeklyRate: {
        type: Number,
        default: 0,
        min: 0,
      },

      standardWeeklyHours: {
        type: Number,
        default: 0,
        min: 0,
      },

      workedHours: {
        type: Number,
        default: 0,
        min: 0,
      },

      minimumGrossPay: {
        type: Number,
        default: 0,
        min: 0,
      },

      assessedGrossPay: {
        type: Number,
        default: 0,
        min: 0,
      },

      shortfall: {
        type: Number,
        default: 0,
        min: 0,
      },

      compliant: {
        type: Boolean,
        default: false,
      },

      assessmentStatus: {
        type: String,
        enum: [
          "Compliant",
          "Non-Compliant",
          "Not Assessed",
          "Not Applicable",
        ],
        default: "Not Assessed",
      },

      warning: {
        type: String,
        default: "",
        trim: true,
      },

      ruleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MinimumWageRule",
        default: null,
      },

      ruleCode: {
        type: String,
        default: "",
        trim: true,
      },

      ruleSnapshot: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },

      attendancePeriodId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AttendancePeriod",
        default: null,
      },

      attendancePeriodNumber: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      attendancePeriodStatus: {
        type: String,
        default: "",
        trim: true,
      },

      payableHoursSource: {
        type: String,
        enum: [
          "",
          "Payroll Ready Attendance",
          "Manual Preview",
          "Not Applicable",
        ],
        default: "",
      },

      assessedAt: {
        type: Date,
        default: null,
      },
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