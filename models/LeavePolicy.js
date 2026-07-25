const mongoose = require("mongoose");

const LEAVE_TYPES = [
  "Vacation",
  "Sick",
  "Maternity",
  "Maternity Extension",
  "Employment Injury",
  "Emergency",
  "Compassionate",
  "Bereavement",
  "Paternity",
  "Family Care",
  "Study",
  "Unpaid",
  "Other Authorized",
];

const LEGAL_CLASSIFICATIONS = [
  "Statutory",
  "Company Policy",
];

const PAY_TREATMENTS = [
  "Paid",
  "Unpaid",
  "Mixed",
  "NIS-Coordinated",
];

const PAYROLL_EFFECTS = [
  "Include Scheduled Pay",
  "Exclude Leave Time",
  "Mixed Treatment",
  "NIS Benefit Coordination",
  "Manual Review",
];

const ACCRUAL_METHODS = [
  "None",
  "Annual Grant",
  "Monthly Accrual",
  "Days Worked",
  "Manual",
];

const DURATION_UNITS = [
  "Scheduled Days",
  "Calendar Days",
  "Calendar Weeks",
];

const POLICY_STATUSES = [
  "Draft",
  "Active",
  "Retired",
  "Cancelled",
];

const ELIGIBLE_EMPLOYMENT_TYPES = [
  "Permanent",
  "Temporary",
  "Part-Time",
  "Contract",
  "Probation",
];

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidYmdDate = (value) => {
  if (value === null || value === undefined || value === "") {
    return true;
  }

  const text = String(value).trim();

  if (!YMD_PATTERN.test(text)) {
    return false;
  }

  const date = new Date(`${text}T12:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === text
  );
};

const LeavePolicySchema = new mongoose.Schema(
  {
    policyCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    policyName: {
      type: String,
      required: true,
      trim: true,
    },

    leaveType: {
      type: String,
      enum: LEAVE_TYPES,
      required: true,
      index: true,
    },

    jurisdiction: {
      type: String,
      default: "Jamaica",
      trim: true,
    },

    legalClassification: {
      type: String,
      enum: LEGAL_CLASSIFICATIONS,
      required: true,
      index: true,
    },

    legalReference: {
      type: String,
      default: "",
      trim: true,
    },

    policyDescription: {
      type: String,
      default: "",
      trim: true,
    },

    effectiveFrom: {
      type: String,
      required: true,
      trim: true,
      index: true,
      validate: {
        validator: isValidYmdDate,
        message:
          "Leave-policy effective-from date must use YYYY-MM-DD.",
      },
    },

    effectiveTo: {
      type: String,
      default: "",
      trim: true,
      index: true,
      validate: {
        validator: isValidYmdDate,
        message:
          "Leave-policy effective-to date must use YYYY-MM-DD.",
      },
    },

    eligibleEmploymentTypes: [
      {
        type: String,
        enum: ELIGIBLE_EMPLOYMENT_TYPES,
      },
    ],

    minimumServiceDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    minimumServiceWeeks: {
      type: Number,
      default: 0,
      min: 0,
    },

    minimumServiceMonths: {
      type: Number,
      default: 0,
      min: 0,
    },

    minimumDaysWorked: {
      type: Number,
      default: 0,
      min: 0,
    },

    payTreatment: {
      type: String,
      enum: PAY_TREATMENTS,
      required: true,
      index: true,
    },

    payrollEffect: {
      type: String,
      enum: PAYROLL_EFFECTS,
      required: true,
    },

    countsAsPayableAttendance: {
      type: Boolean,
      default: true,
    },

    payPercentage: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },

    employerPaidDays: {
      type: Number,
      default: 0,
      min: 0,
    },

        unpaidDaysAvailable: {
      type: Number,
      default: 0,
      min: 0,
    },

    /*
     * Statutory-duration controls.
     *
     * Existing policies continue using Scheduled Days.
     * Calendar Weeks allows maternity and similar statutory
     * leave to remain accurate for employees with different
     * weekly work schedules.
     */
    durationUnit: {
      type: String,
      enum: DURATION_UNITS,
      default: "Scheduled Days",
    },

    standardDurationUnits: {
      type: Number,
      default: 0,
      min: 0,
    },

    employerPaidDurationUnits: {
      type: Number,
      default: 0,
      min: 0,
    },

    maximumExtensionUnits: {
      type: Number,
      default: 0,
      min: 0,
    },

    nisCoordinationRequired: {
      type: Boolean,
      default: false,
    },

    balanceTracked: {
      type: Boolean,
      default: false,
    },

    balanceType: {
      type: String,
      enum: [
        "",
        "Vacation",
        "Sick",
        "Emergency",
        "Other",
      ],
      default: "",
    },

    accrualMethod: {
      type: String,
      enum: ACCRUAL_METHODS,
      default: "None",
    },

    annualEntitlementDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    monthlyAccrualDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    daysWorkedPerLeaveDay: {
      type: Number,
      default: 0,
      min: 0,
    },

    maximumBalanceDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    maximumConsecutiveDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    carryForwardAllowed: {
      type: Boolean,
      default: false,
    },

    maximumCarryForwardDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    negativeBalanceAllowed: {
      type: Boolean,
      default: false,
    },

    supportingDocumentsRequired: {
      type: Boolean,
      default: false,
    },

    documentRequiredAfterDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    acceptedDocumentTypes: [
      {
        type: String,
        trim: true,
      },
    ],

    medicalCertificateRequired: {
      type: Boolean,
      default: false,
    },

    medicalCertificateRequiredAfterDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    advanceNoticeRequired: {
      type: Boolean,
      default: false,
    },

    minimumAdvanceNoticeDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    managerApprovalRequired: {
      type: Boolean,
      default: true,
    },

    hrApprovalRequired: {
      type: Boolean,
      default: true,
    },

    employeeAcknowledgementRequired: {
      type: Boolean,
      default: false,
    },

    allowPartialDay: {
      type: Boolean,
      default: false,
    },

    allowRetrospectiveRequest: {
      type: Boolean,
      default: false,
    },

    genderRestriction: {
      type: String,
      enum: [
        "None",
        "Female",
        "Male",
        "Policy Defined",
      ],
      default: "None",
    },

    maximumPaidOccurrences: {
      type: Number,
      default: 0,
      min: 0,
    },

    sourceName: {
      type: String,
      default: "",
      trim: true,
    },

    sourceUrl: {
      type: String,
      default: "",
      trim: true,
    },

    sourceVerifiedAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: POLICY_STATUSES,
      default: "Draft",
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

    retiredBy: {
      type: String,
      default: "",
      trim: true,
    },

    retiredAt: {
      type: Date,
      default: null,
    },

    retirementReason: {
      type: String,
      default: "",
      trim: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    createdBy: {
      type: String,
      default: "",
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
  }
);

LeavePolicySchema.index({
  leaveType: 1,
  status: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
});

LeavePolicySchema.index({
  legalClassification: 1,
  status: 1,
});

LeavePolicySchema.pre(
  "validate",
  function validatePolicy() {
    if (
      this.effectiveFrom &&
      this.effectiveTo &&
      this.effectiveTo <
        this.effectiveFrom
    ) {
            throw new Error(
        "Leave-policy effective-to date cannot be earlier than its effective-from date."
      );
    }

    const standardDurationUnits =
      Number(
        this.standardDurationUnits || 0
      );

    const employerPaidDurationUnits =
      Number(
        this.employerPaidDurationUnits ||
          0
      );

    if (
      this.durationUnit ===
        "Calendar Weeks" &&
      standardDurationUnits < 1
    ) {
      throw new Error(
        "A calendar-week leave policy must specify its standard duration."
      );
    }

    if (
      employerPaidDurationUnits >
      standardDurationUnits
    ) {
      throw new Error(
        "Employer-paid duration cannot exceed the standard leave duration."
      );
    }

    if (
      this.durationUnit ===
        "Calendar Weeks" &&
      standardDurationUnits > 0
    ) {
      this.maximumConsecutiveDays =
        standardDurationUnits * 7;
    }

    if (
      this.payTreatment === "Unpaid"
    ) {
      this.payPercentage = 0;
      this.countsAsPayableAttendance =
        false;
      this.payrollEffect =
        "Exclude Leave Time";
    }

    if (
      this.payTreatment === "Paid"
    ) {
      this.countsAsPayableAttendance =
        true;
      this.payrollEffect =
        "Include Scheduled Pay";

      if (
        Number(
          this.payPercentage || 0
        ) === 0
      ) {
        this.payPercentage = 100;
      }
    }

    if (
      this.payTreatment ===
      "NIS-Coordinated"
    ) {
      this.nisCoordinationRequired =
        true;
      this.payrollEffect =
        "NIS Benefit Coordination";
    }

    if (!this.balanceTracked) {
      this.balanceType = "";
      this.accrualMethod = "None";
      this.annualEntitlementDays = 0;
      this.monthlyAccrualDays = 0;
      this.daysWorkedPerLeaveDay = 0;
      this.maximumBalanceDays = 0;
      this.maximumCarryForwardDays = 0;
      this.negativeBalanceAllowed =
        false;
    }

    if (
      this.medicalCertificateRequired &&
      Number(
        this
          .medicalCertificateRequiredAfterDays ||
          0
      ) < 1
    ) {
      this.medicalCertificateRequiredAfterDays =
        1;
    }
  }
);

module.exports = mongoose.model(
  "LeavePolicy",
  LeavePolicySchema
);