const mongoose = require("mongoose");

const CASE_TYPES = [
  "Onboarding",
  "Offboarding",
];

const CASE_STATUSES = [
  "Draft",
  "Pending Approval",
  "Approved",
  "In Progress",
  "Blocked",
  "Ready for Completion",
  "Completed",
  "Cancelled",
];

const CHECKLIST_CATEGORIES = [
  "HR",
  "Manager",
  "Employee",
  "Payroll",
  "System Access",
  "Documents",
  "Training",
  "Property",
  "Probation",
  "Compliance",
  "Other",
];

const CHECKLIST_STATUSES = [
  "Not Started",
  "In Progress",
  "Completed",
  "Not Applicable",
  "Blocked",
];

const ACCESS_ACTIONS = [
  "Create",
  "Activate",
  "Modify",
  "Review",
  "Deactivate",
  "Revoke",
];

const ACCESS_STATUSES = [
  "Not Requested",
  "Requested",
  "Approved",
  "Provisioned",
  "Modified",
  "Reviewed",
  "Deactivated",
  "Revoked",
  "Not Applicable",
  "Blocked",
];

const PROPERTY_ACTIONS = [
  "Issue",
  "Return",
  "Transfer",
  "Inspect",
];

const PROPERTY_STATUSES = [
  "Pending",
  "Issued",
  "Returned",
  "Transferred",
  "Lost",
  "Damaged",
  "Not Applicable",
];

const PROBATION_STATUSES = [
  "Not Applicable",
  "Pending",
  "In Progress",
  "Review Due",
  "Passed",
  "Extended",
  "Failed",
];

const FINAL_PAYROLL_STATUSES = [
  "Not Required",
  "Pending Review",
  "Awaiting Payroll",
  "Payroll Linked",
  "Approved",
  "Paid",
  "Blocked",
];

const APPROVAL_STATUSES = [
  "Not Required",
  "Pending",
  "Approved",
  "Rejected",
];

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const normalizeString = (value) =>
  String(value || "").trim();

const isValidYmdDate = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return true;
  }

  const text =
    normalizeString(value);

  if (!YMD_PATTERN.test(text)) {
    return false;
  }

  const date =
    new Date(
      `${text}T12:00:00.000Z`
    );

  return (
    !Number.isNaN(
      date.getTime()
    ) &&
    date
      .toISOString()
      .slice(0, 10) === text
  );
};

const ymdField = (
  message
) => ({
  type: String,
  default: "",
  trim: true,
  validate: {
    validator: isValidYmdDate,
    message,
  },
});

const EmployeeSnapshotSchema =
  new mongoose.Schema(
    {
      fullName: {
        type: String,
        required: true,
        trim: true,
      },

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

      employmentType: {
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

      reportsToEmployeeId: {
        type: String,
        default: "",
        trim: true,
      },

      reportsToName: {
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
    {
      _id: false,
    }
  );

const ApprovalSchema =
  new mongoose.Schema(
    {
      required: {
        type: Boolean,
        default: true,
      },

      status: {
        type: String,
        enum: APPROVAL_STATUSES,
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
    {
      _id: false,
    }
  );

const ChecklistItemSchema =
  new mongoose.Schema(
    {
      itemNumber: {
        type: String,
        required: true,
        trim: true,
      },

      category: {
        type: String,
        enum: CHECKLIST_CATEGORIES,
        required: true,
      },

      title: {
        type: String,
        required: true,
        trim: true,
      },

      description: {
        type: String,
        default: "",
        trim: true,
      },

      required: {
        type: Boolean,
        default: true,
      },

      assignedToName: {
        type: String,
        default: "",
        trim: true,
      },

      assignedToUserId: {
        type: String,
        default: "",
        trim: true,
      },

      dueDate: ymdField(
        "Checklist due date must use YYYY-MM-DD."
      ),

      status: {
        type: String,
        enum: CHECKLIST_STATUSES,
        default: "Not Started",
      },

      completedBy: {
        type: String,
        default: "",
        trim: true,
      },

      completedByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      completedAt: {
        type: Date,
        default: null,
      },

      completionNotes: {
        type: String,
        default: "",
        trim: true,
      },

      evidenceReference: {
        type: String,
        default: "",
        trim: true,
      },

      blockedReason: {
        type: String,
        default: "",
        trim: true,
      },
    },
    {
      timestamps: true,
    }
  );

const SystemAccessItemSchema =
  new mongoose.Schema(
    {
      accessNumber: {
        type: String,
        required: true,
        trim: true,
      },

      systemName: {
        type: String,
        required: true,
        trim: true,
      },

      accountIdentifier: {
        type: String,
        default: "",
        trim: true,
      },

      action: {
        type: String,
        enum: ACCESS_ACTIONS,
        required: true,
      },

      requestedRole: {
        type: String,
        default: "",
        trim: true,
      },

      requestedPermissions: {
        type: [String],
        default: [],
      },

      status: {
        type: String,
        enum: ACCESS_STATUSES,
        default: "Not Requested",
      },

      completedBy: {
        type: String,
        default: "",
        trim: true,
      },

      completedByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      completedAt: {
        type: Date,
        default: null,
      },

      accountStatusBefore: {
        type: String,
        default: "",
        trim: true,
      },

      accountStatusAfter: {
        type: String,
        default: "",
        trim: true,
      },

      permissionsBefore: {
        type: [String],
        default: [],
      },

      permissionsAfter: {
        type: [String],
        default: [],
      },

      notes: {
        type: String,
        default: "",
        trim: true,
      },
    },
    {
      timestamps: true,
    }
  );

const PropertyItemSchema =
  new mongoose.Schema(
    {
      propertyNumber: {
        type: String,
        required: true,
        trim: true,
      },

      propertyName: {
        type: String,
        required: true,
        trim: true,
      },

      propertyType: {
        type: String,
        default: "",
        trim: true,
      },

      serialNumber: {
        type: String,
        default: "",
        trim: true,
      },

      assetReference: {
        type: String,
        default: "",
        trim: true,
      },

      action: {
        type: String,
        enum: PROPERTY_ACTIONS,
        required: true,
      },

      status: {
        type: String,
        enum: PROPERTY_STATUSES,
        default: "Pending",
      },

      conditionBefore: {
        type: String,
        default: "",
        trim: true,
      },

      conditionAfter: {
        type: String,
        default: "",
        trim: true,
      },

      issuedAt: {
        type: Date,
        default: null,
      },

      returnedAt: {
        type: Date,
        default: null,
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

      notes: {
        type: String,
        default: "",
        trim: true,
      },

      evidenceReference: {
        type: String,
        default: "",
        trim: true,
      },
    },
    {
      timestamps: true,
    }
  );

const ProbationCoordinationSchema =
  new mongoose.Schema(
    {
      required: {
        type: Boolean,
        default: false,
      },

      status: {
        type: String,
        enum: PROBATION_STATUSES,
        default: "Not Applicable",
      },

      startDate: ymdField(
        "Probation start date must use YYYY-MM-DD."
      ),

      expectedEndDate: ymdField(
        "Probation expected end date must use YYYY-MM-DD."
      ),

      reviewDate: ymdField(
        "Probation review date must use YYYY-MM-DD."
      ),

      performanceReviewNumber: {
        type: String,
        default: "",
        trim: true,
      },

      outcome: {
        type: String,
        enum: [
          "",
          "Passed",
          "Extended",
          "Failed",
        ],
        default: "",
      },

      extensionEndDate: ymdField(
        "Probation extension end date must use YYYY-MM-DD."
      ),

      reviewedBy: {
        type: String,
        default: "",
        trim: true,
      },

      reviewedByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      reviewedAt: {
        type: Date,
        default: null,
      },

      notes: {
        type: String,
        default: "",
        trim: true,
      },
    },
    {
      _id: false,
    }
  );

const FinalPayrollSchema =
  new mongoose.Schema(
    {
      required: {
        type: Boolean,
        default: false,
      },

      status: {
        type: String,
        enum: FINAL_PAYROLL_STATUSES,
        default: "Not Required",
      },

      targetPayDate: ymdField(
        "Final-payroll target date must use YYYY-MM-DD."
      ),

      payrollNumber: {
        type: String,
        default: "",
        trim: true,
      },

      payPeriod: {
        type: String,
        default: "",
        trim: true,
      },

      payrollStatus: {
        type: String,
        default: "",
        trim: true,
      },

      grossPay: {
        type: Number,
        default: 0,
        min: 0,
      },

      totalDeductions: {
        type: Number,
        default: 0,
        min: 0,
      },

      netPay: {
        type: Number,
        default: 0,
        min: 0,
      },

      journalEntryNumber: {
        type: String,
        default: "",
        trim: true,
      },

      outstandingPayNotes: {
        type: String,
        default: "",
        trim: true,
      },

      leaveSettlementNotes: {
        type: String,
        default: "",
        trim: true,
      },

      advanceRecoveryNotes: {
        type: String,
        default: "",
        trim: true,
      },

      exceptionMessage: {
        type: String,
        default: "",
        trim: true,
      },

      reviewedBy: {
        type: String,
        default: "",
        trim: true,
      },

      reviewedByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      reviewedAt: {
        type: Date,
        default: null,
      },

      completedAt: {
        type: Date,
        default: null,
      },
    },
    {
      _id: false,
    }
  );

const WorkflowHistorySchema =
  new mongoose.Schema(
    {
      action: {
        type: String,
        required: true,
        trim: true,
      },

      fromStatus: {
        type: String,
        default: "",
        trim: true,
      },

      toStatus: {
        type: String,
        required: true,
        trim: true,
      },

      notes: {
        type: String,
        default: "",
        trim: true,
      },

      performedBy: {
        type: String,
        required: true,
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
    {
      timestamps: false,
    }
  );

const EmployeeLifecycleCaseSchema =
  new mongoose.Schema(
    {
      lifecycleCaseNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
        index: true,
      },

      caseType: {
        type: String,
        enum: CASE_TYPES,
        required: true,
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

      employeeSnapshot: {
        type: EmployeeSnapshotSchema,
        required: true,
      },

      reason: {
        type: String,
        required: true,
        trim: true,
      },

      plannedEffectiveDate: {
        ...ymdField(
          "Planned lifecycle effective date must use YYYY-MM-DD."
        ),
        required: true,
      },

      actualEffectiveDate: ymdField(
        "Actual lifecycle effective date must use YYYY-MM-DD."
      ),

      lastWorkingDate: ymdField(
        "Last working date must use YYYY-MM-DD."
      ),

      expectedStartDate: ymdField(
        "Expected start date must use YYYY-MM-DD."
      ),

      actualStartDate: ymdField(
        "Actual start date must use YYYY-MM-DD."
      ),

      assignedHrOfficer: {
        type: String,
        default: "",
        trim: true,
      },

      assignedHrOfficerUserId: {
        type: String,
        default: "",
        trim: true,
      },

      assignedManager: {
        type: String,
        default: "",
        trim: true,
      },

      assignedManagerEmployeeId: {
        type: String,
        default: "",
        trim: true,
      },

      assignedManagerUserId: {
        type: String,
        default: "",
        trim: true,
      },

      managerApproval: {
        type: ApprovalSchema,
        default: () => ({}),
      },

      hrApproval: {
        type: ApprovalSchema,
        default: () => ({}),
      },

      checklistItems: {
        type: [ChecklistItemSchema],
        default: [],
      },

      systemAccessItems: {
        type: [SystemAccessItemSchema],
        default: [],
      },

      propertyItems: {
        type: [PropertyItemSchema],
        default: [],
      },

      probationCoordination: {
        type:
          ProbationCoordinationSchema,
        default: () => ({}),
      },

      finalPayroll: {
        type: FinalPayrollSchema,
        default: () => ({}),
      },

      documentReferences: {
        type: [String],
        default: [],
      },

      confidentialNotes: {
        type: String,
        default: "",
        trim: true,
      },

      employeeVisibleNotes: {
        type: String,
        default: "",
        trim: true,
      },

      status: {
        type: String,
        enum: CASE_STATUSES,
        default: "Draft",
        index: true,
      },

      blockedReason: {
        type: String,
        default: "",
        trim: true,
      },

      completionSummary: {
        type: String,
        default: "",
        trim: true,
      },

      submittedAt: {
        type: Date,
        default: null,
      },

      approvedAt: {
        type: Date,
        default: null,
      },

      startedAt: {
        type: Date,
        default: null,
      },

      completedAt: {
        type: Date,
        default: null,
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

      createdBy: {
        type: String,
        required: true,
        trim: true,
      },

      createdByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      updatedBy: {
        type: String,
        default: "",
        trim: true,
      },

      workflowHistory: {
        type: [WorkflowHistorySchema],
        default: [],
      },
    },
    {
      timestamps: true,
    }
  );

EmployeeLifecycleCaseSchema.index({
  employeeId: 1,
  caseType: 1,
  status: 1,
});

EmployeeLifecycleCaseSchema.index({
  plannedEffectiveDate: 1,
  status: 1,
});

EmployeeLifecycleCaseSchema.index({
  "finalPayroll.payrollNumber": 1,
});

EmployeeLifecycleCaseSchema.pre(
  "validate",
  function validateLifecycleCase(
    next
  ) {
    try {
      if (
        this.caseType ===
          "Onboarding" &&
        !this.expectedStartDate
      ) {
        this.invalidate(
          "expectedStartDate",
          "An onboarding case requires an expected start date."
        );
      }

      if (
        this.caseType ===
          "Offboarding" &&
        !this.lastWorkingDate
      ) {
        this.invalidate(
          "lastWorkingDate",
          "An offboarding case requires a last working date."
        );
      }

      if (
        this.caseType ===
        "Onboarding"
      ) {
        this.finalPayroll.required =
          false;

        this.finalPayroll.status =
          "Not Required";
      }

      if (
        this.caseType ===
        "Offboarding"
      ) {
        this.probationCoordination.required =
          false;

        this.probationCoordination.status =
          "Not Applicable";
      }

      if (
        this.probationCoordination
          .required &&
        this.probationCoordination
          .status ===
          "Not Applicable"
      ) {
        this.invalidate(
          "probationCoordination.status",
          "Required probation coordination cannot use Not Applicable status."
        );
      }

      if (
        !this
          .probationCoordination
          .required
      ) {
        this.probationCoordination.status =
          "Not Applicable";
      }

      if (
        this.finalPayroll
          .required &&
        this.finalPayroll.status ===
          "Not Required"
      ) {
        this.invalidate(
          "finalPayroll.status",
          "Required final payroll cannot use Not Required status."
        );
      }

      if (
        !this.finalPayroll
          .required
      ) {
        this.finalPayroll.status =
          "Not Required";
      }

      if (
        this.status ===
          "Blocked" &&
        !normalizeString(
          this.blockedReason
        )
      ) {
        this.invalidate(
          "blockedReason",
          "A blocked lifecycle case requires a blocked reason."
        );
      }

      if (
        this.status ===
          "Cancelled" &&
        !normalizeString(
          this.cancellationReason
        )
      ) {
        this.invalidate(
          "cancellationReason",
          "A cancelled lifecycle case requires a cancellation reason."
        );
      }

      if (
        this.status ===
          "Completed" &&
        !normalizeString(
          this.completionSummary
        )
      ) {
        this.invalidate(
          "completionSummary",
          "A completed lifecycle case requires a completion summary."
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  }
);

module.exports = mongoose.model(
  "EmployeeLifecycleCase",
  EmployeeLifecycleCaseSchema
);