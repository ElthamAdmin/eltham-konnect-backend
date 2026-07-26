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

const LEAVE_STATUSES = [
  "Draft",
  "Pending",
  "Submitted",
  "Manager Approved",
  "Approved",
  "Rejected",
  "Cancelled",
  "Completed",
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

const DOCUMENT_STATUSES = [
  "Not Required",
  "Pending",
  "Provided",
  "Verified",
  "Rejected",
];

const BALANCE_EFFECTS = [
  "Deduct",
  "No Deduction",
  "Manual Adjustment",
];

const DECISION_STATUSES = [
  "Not Required",
  "Pending",
  "Approved",
  "Rejected",
];

const PROCESSING_STATUSES = [
  "Not Required",
  "Pending",
  "Applied",
  "Failed",
  "Reversed",
];

const NIS_COORDINATION_STATUSES = [
  "Not Required",
  "Pending",
  "Submitted",
  "Approved",
  "Rejected",
  "Paid",
];

const WORKFLOW_ACTIONS = [
  "Created",
  "Submitted",
  "Manager Approved",
  "HR Approved",
  "Rejected",
  "Cancelled",
  "Completed",
  "Employee Acknowledged",
  "Document Added",
  "Document Verified",
  "Document Rejected",
  "Balance Applied",
  "Balance Reversed",
  "Attendance Applied",
  "Attendance Reversed",
  "Payroll Effect Confirmed",
  "Payroll Effect Reversed",
  "NIS Coordination Updated",
];

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidYmdDate = (value) => {
  const text = String(value || "").trim();

  if (!text) {
    return true;
  }

  if (!YMD_PATTERN.test(text)) {
    return false;
  }

  const date = new Date(`${text}T12:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === text
  );
};

const LeaveRequestSchema = new mongoose.Schema(
  {
    leaveRequestId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    employeeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    linkedUserId: {
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

    employeeSnapshot: {
      jobTitle: {
        type: String,
        default: "",
        trim: true,
      },

      department: {
        type: String,
        default: "",
        trim: true,
      },

      branch: {
        type: String,
        default: "",
        trim: true,
      },

      employmentClassification: {
        type: String,
        default: "",
        trim: true,
      },

      employmentStatus: {
        type: String,
        default: "",
        trim: true,
      },

      payFrequency: {
        type: String,
        default: "",
        trim: true,
      },

      payrollEnabled: {
        type: Boolean,
        default: false,
      },
    },

    /*
     * Legacy snapshot fields are retained so existing frontend
     * and reporting code does not break.
     */
    department: {
      type: String,
      default: "",
      trim: true,
    },

    branch: {
      type: String,
      default: "",
      trim: true,
    },

    leaveType: {
      type: String,
      enum: LEAVE_TYPES,
      required: true,
      index: true,
    },

    legalClassification: {
      type: String,
      enum: LEGAL_CLASSIFICATIONS,
      default: "Company Policy",
    },

    policyCode: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    policyName: {
      type: String,
      default: "",
      trim: true,
    },

    policyEffectiveFrom: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: isValidYmdDate,
        message:
          "Leave-policy effective-from date must use YYYY-MM-DD.",
      },
    },

    policySnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    startDate: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: isValidYmdDate,
        message: "Leave start date must use YYYY-MM-DD.",
      },
    },

    endDate: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: isValidYmdDate,
        message: "Leave end date must use YYYY-MM-DD.",
      },
    },

    totalDays: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalScheduledMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    payableLeaveMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    unpaidLeaveMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    dailyBreakdown: [
      {
        workDate: {
          type: String,
          required: true,
          trim: true,
          validate: {
            validator: isValidYmdDate,
            message:
              "Leave breakdown work date must use YYYY-MM-DD.",
          },
        },

        dayName: {
          type: String,
          default: "",
          trim: true,
        },

        scheduledWorkday: {
          type: Boolean,
          default: false,
        },

        scheduledMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },

        payableMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },

        unpaidMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },

        payTreatment: {
          type: String,
          enum: PAY_TREATMENTS,
          default: "Paid",
        },

        notes: {
          type: String,
          default: "",
          trim: true,
        },
      },
    ],

    payTreatment: {
      type: String,
      enum: PAY_TREATMENTS,
      default: "Paid",
      index: true,
    },

    payrollEffect: {
      type: String,
      enum: PAYROLL_EFFECTS,
      default: "Include Scheduled Pay",
    },

    countsAsPayableAttendance: {
      type: Boolean,
      default: true,
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

    balanceEffect: {
      type: String,
      enum: BALANCE_EFFECTS,
      default: "No Deduction",
    },

    balanceUnits: {
      type: Number,
      default: 0,
      min: 0,
    },

    balanceApplied: {
      type: Boolean,
      default: false,
    },

    balanceAppliedAt: {
      type: Date,
      default: null,
    },

    balanceAppliedBy: {
      type: String,
      default: "",
      trim: true,
    },

        balanceTransactionNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    balanceReversalTransactionNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    reason: {
      type: String,
      default: "",
      trim: true,
    },

    employeeComments: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: LEAVE_STATUSES,
      default: "Pending",
      index: true,
    },

    supportingDocumentsRequired: {
      type: Boolean,
      default: false,
    },

    documentStatus: {
      type: String,
      enum: DOCUMENT_STATUSES,
      default: "Not Required",
    },

    documents: [
      {
        documentNumber: {
          type: String,
          default: "",
          trim: true,
        },

        documentType: {
          type: String,
          default: "",
          trim: true,
        },

        documentName: {
          type: String,
          default: "",
          trim: true,
        },

        fileUrl: {
          type: String,
          default: "",
          trim: true,
        },

        mimeType: {
          type: String,
          default: "",
          trim: true,
        },

        confidential: {
          type: Boolean,
          default: true,
        },

        uploadedBy: {
          type: String,
          default: "",
          trim: true,
        },

        uploadedAt: {
          type: Date,
          default: Date.now,
        },

        verified: {
          type: Boolean,
          default: false,
        },

        verifiedBy: {
          type: String,
          default: "",
          trim: true,
        },

        verifiedAt: {
          type: Date,
          default: null,
        },

        verificationNotes: {
          type: String,
          default: "",
          trim: true,
        },
      },
    ],

    medicalCertificateRequired: {
      type: Boolean,
      default: false,
    },

    medicalCertificateReceived: {
      type: Boolean,
      default: false,
    },

    expectedReturnDate: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: isValidYmdDate,
        message:
          "Expected return date must use YYYY-MM-DD.",
      },
    },

    actualReturnDate: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: isValidYmdDate,
        message:
          "Actual return date must use YYYY-MM-DD.",
      },
    },

    adminComment: {
      type: String,
      default: "",
      trim: true,
    },

    approvalNotes: {
      type: String,
      default: "",
      trim: true,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewedBy: {
      type: String,
      default: "",
      trim: true,
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    submittedBy: {
      type: String,
      default: "",
      trim: true,
    },

        managerDecision: {
      status: {
        type: String,
        enum: DECISION_STATUSES,
        default: "Pending",
      },

      decidedBy: {
        type: String,
        default: "",
        trim: true,
      },

      decidedByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      decidedAt: {
        type: Date,
        default: null,
      },

      notes: {
        type: String,
        default: "",
        trim: true,
      },
    },

    hrDecision: {
      status: {
        type: String,
        enum: DECISION_STATUSES,
        default: "Pending",
      },

      decidedBy: {
        type: String,
        default: "",
        trim: true,
      },

      decidedByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      decidedAt: {
        type: Date,
        default: null,
      },

      notes: {
        type: String,
        default: "",
        trim: true,
      },
    },

    employeeAcknowledgement: {
      required: {
        type: Boolean,
        default: false,
      },

      acknowledged: {
        type: Boolean,
        default: false,
      },

      acknowledgedBy: {
        type: String,
        default: "",
        trim: true,
      },

      acknowledgedByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      acknowledgedAt: {
        type: Date,
        default: null,
      },

      comments: {
        type: String,
        default: "",
        trim: true,
      },
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: String,
      default: "",
      trim: true,
    },

    cancellationReason: {
      type: String,
      default: "",
      trim: true,
    },

    payrollProcessed: {
      type: Boolean,
      default: false,
    },

    payrollNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    payrollProcessedAt: {
      type: Date,
      default: null,
    },

        attendanceProcessing: {
      status: {
        type: String,
        enum: PROCESSING_STATUSES,
        default: "Pending",
      },

      processedBy: {
        type: String,
        default: "",
        trim: true,
      },

      processedByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      processedAt: {
        type: Date,
        default: null,
      },

      errorMessage: {
        type: String,
        default: "",
        trim: true,
      },
    },

    payrollProcessing: {
      status: {
        type: String,
        enum: PROCESSING_STATUSES,
        default: "Pending",
      },

      processedBy: {
        type: String,
        default: "",
        trim: true,
      },

      processedByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      processedAt: {
        type: Date,
        default: null,
      },

      errorMessage: {
        type: String,
        default: "",
        trim: true,
      },
    },

    nisCoordination: {
      required: {
        type: Boolean,
        default: false,
      },

      status: {
        type: String,
        enum: NIS_COORDINATION_STATUSES,
        default: "Not Required",
      },

      claimReference: {
        type: String,
        default: "",
        trim: true,
      },

      benefitDecisionReference: {
        type: String,
        default: "",
        trim: true,
      },

      approvedBenefitAmount: {
        type: Number,
        default: 0,
        min: 0,
      },

      benefitPaidAmount: {
        type: Number,
        default: 0,
        min: 0,
      },

      submittedAt: {
        type: Date,
        default: null,
      },

      decidedAt: {
        type: Date,
        default: null,
      },

      notes: {
        type: String,
        default: "",
        trim: true,
      },
    },

    attendancePeriodsUpdated: [
      {
        periodNumber: {
          type: String,
          default: "",
          trim: true,
        },

        periodKey: {
          type: String,
          default: "",
          trim: true,
        },

        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    workflowHistory: [
      {
        action: {
          type: String,
          enum: WORKFLOW_ACTIONS,
          required: true,
        },

        fromStatus: {
          type: String,
          default: "",
          trim: true,
        },

        toStatus: {
          type: String,
          default: "",
          trim: true,
        },

        notes: {
          type: String,
          default: "",
          trim: true,
        },

        performedBy: {
          type: String,
          default: "",
          trim: true,
        },

        performedByUserId: {
          type: String,
          default: "",
          trim: true,
        },

        performedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

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

LeaveRequestSchema.index({
  employeeId: 1,
  startDate: 1,
  endDate: 1,
});

LeaveRequestSchema.index({
  employeeId: 1,
  status: 1,
});

LeaveRequestSchema.index({
  linkedUserId: 1,
  status: 1,
});

LeaveRequestSchema.index({
  status: 1,
  startDate: 1,
  endDate: 1,
});

LeaveRequestSchema.pre(
  "validate",
  function validateLeaveDates() {
    if (
      this.startDate &&
      this.endDate &&
      this.endDate <
        this.startDate
    ) {
      throw new Error(
        "Leave end date cannot be earlier than its start date."
      );
    }

    if (
      Number(
        this.payableLeaveMinutes ||
          0
      ) +
        Number(
          this.unpaidLeaveMinutes ||
            0
        ) >
      Number(
        this.totalScheduledMinutes ||
          0
      )
    ) {
      throw new Error(
        "Combined payable and unpaid leave minutes cannot exceed scheduled leave minutes."
      );
    }

    /*
     * Unpaid leave must never be
     * counted as payable attendance.
     */
    if (
      this.payTreatment === "Unpaid"
    ) {
      this.countsAsPayableAttendance =
        false;
      this.payrollEffect =
        "Exclude Leave Time";
    }

        /*
     * Paid leave is employer-payable attendance.
     * Mixed and NIS-coordinated treatments must preserve
     * the value resolved from their effective policy.
     */
    if (this.payTreatment === "Paid") {
      this.countsAsPayableAttendance =
        true;
    }

    if (
      this.payTreatment ===
      "NIS-Coordinated"
    ) {
      this.nisCoordination.required =
        true;

      if (
        this.nisCoordination.status ===
        "Not Required"
      ) {
        this.nisCoordination.status =
          "Pending";
      }
    }
  }
);

module.exports = mongoose.model(
  "LeaveRequest",
  LeaveRequestSchema
);