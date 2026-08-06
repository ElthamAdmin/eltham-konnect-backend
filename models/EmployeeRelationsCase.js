const mongoose = require("mongoose");

const CASE_TYPES = ["Discipline", "Grievance"];

const CASE_STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Investigation",
  "Hearing Scheduled",
  "Awaiting Decision",
  "Decision Issued",
  "Awaiting Acknowledgement",
  "Appeal Submitted",
  "Appeal Review",
  "Closed",
  "Withdrawn",
  "Cancelled",
];

const PRIORITY_LEVELS = [
  "Low",
  "Normal",
  "High",
  "Urgent",
];

const CONFIDENTIALITY_LEVELS = [
  "Restricted HR",
  "Case Participants",
  "Highly Restricted",
];

const DISCIPLINE_CATEGORIES = [
  "Attendance",
  "Conduct",
  "Performance",
  "Policy Breach",
  "Safety",
  "Property",
  "Confidentiality",
  "Insubordination",
  "Other",
];

const GRIEVANCE_CATEGORIES = [
  "Working Conditions",
  "Pay or Benefits",
  "Leave",
  "Scheduling",
  "Management Conduct",
  "Co-worker Conduct",
  "Discrimination",
  "Harassment",
  "Health and Safety",
  "Policy Application",
  "Other",
];

const EVIDENCE_TYPES = [
  "Document",
  "Statement",
  "Email",
  "Image",
  "Attendance Record",
  "Payroll Record",
  "Policy",
  "Other",
];

const EVIDENCE_STATUSES = [
  "Submitted",
  "Accepted",
  "Rejected",
  "Withdrawn",
];

const HEARING_STATUSES = [
  "Scheduled",
  "Completed",
  "Postponed",
  "Cancelled",
];

const DECISION_OUTCOMES = [
  "No Action",
  "Informal Resolution",
  "Verbal Warning",
  "Written Warning",
  "Final Warning",
  "Performance Improvement Plan",
  "Suspension",
  "Termination Recommended",
  "Grievance Upheld",
  "Grievance Partially Upheld",
  "Grievance Not Upheld",
  "Mediation",
  "Other",
];

const APPEAL_STATUSES = [
  "Submitted",
  "Under Review",
  "Hearing Scheduled",
  "Upheld",
  "Partially Upheld",
  "Dismissed",
  "Withdrawn",
];

const ACKNOWLEDGEMENT_STATUSES = [
  "Not Required",
  "Pending",
  "Acknowledged",
  "Declined to Acknowledge",
];

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidYmdDate = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return true;
  }

  const text = String(value).trim();

  if (!YMD_PATTERN.test(text)) {
    return false;
  }

  const date = new Date(
    `${text}T12:00:00.000Z`
  );

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === text
  );
};

const ymdValidator = {
  validator: isValidYmdDate,
  message: "Case dates must use YYYY-MM-DD.",
};

const PersonSnapshotSchema =
  new mongoose.Schema(
    {
      employeeId: {
        type: String,
        default: "",
        trim: true,
      },

      linkedUserId: {
        type: String,
        default: "",
        trim: true,
      },

      fullName: {
        type: String,
        default: "",
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

      employmentStatus: {
        type: String,
        default: "",
        trim: true,
      },
    },
    {
      _id: false,
    }
  );

const EvidenceSchema = new mongoose.Schema(
  {
    evidenceNumber: {
      type: String,
      required: true,
      trim: true,
    },

    evidenceType: {
      type: String,
      enum: EVIDENCE_TYPES,
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

    status: {
      type: String,
      enum: EVIDENCE_STATUSES,
      default: "Submitted",
    },

    confidential: {
      type: Boolean,
      default: true,
    },

    file: {
      originalFileName: {
        type: String,
        default: "",
        trim: true,
      },

      mimeType: {
        type: String,
        default: "",
        trim: true,
      },

      sizeBytes: {
        type: Number,
        default: 0,
        min: 0,
      },

      checksumSha256: {
        type: String,
        default: "",
        trim: true,
      },

      storageProvider: {
        type: String,
        enum: ["", "Cloudinary"],
        default: "",
      },

      cloudinaryPublicId: {
        type: String,
        default: "",
        trim: true,
        select: false,
      },

      cloudinaryResourceType: {
        type: String,
        default: "raw",
        trim: true,
        select: false,
      },
    },

    submittedBy: {
      type: String,
      default: "",
      trim: true,
    },

    submittedByUserId: {
      type: String,
      default: "",
      trim: true,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
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

    reviewNotes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const HearingSchema = new mongoose.Schema(
  {
    hearingNumber: {
      type: String,
      required: true,
      trim: true,
    },

    hearingDate: {
      type: String,
      required: true,
      trim: true,
      validate: ymdValidator,
    },

    startTime: {
      type: String,
      default: "",
      trim: true,
    },

    location: {
      type: String,
      default: "",
      trim: true,
    },

    chairperson: {
      type: String,
      required: true,
      trim: true,
    },

    attendees: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },

        role: {
          type: String,
          default: "",
          trim: true,
        },

        userId: {
          type: String,
          default: "",
          trim: true,
        },
      },
    ],

    status: {
      type: String,
      enum: HEARING_STATUSES,
      default: "Scheduled",
    },

    employeeNotifiedAt: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    minutesDocumentNumber: {
      type: String,
      default: "",
      trim: true,
    },

    createdBy: {
      type: String,
      default: "",
      trim: true,
    },

    createdByUserId: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const DecisionSchema = new mongoose.Schema(
  {
    issued: {
      type: Boolean,
      default: false,
    },

    outcome: {
      type: String,
      enum: ["", ...DECISION_OUTCOMES],
      default: "",
    },

    summary: {
      type: String,
      default: "",
      trim: true,
    },

    reasons: {
      type: String,
      default: "",
      trim: true,
    },

    actionRequired: {
      type: String,
      default: "",
      trim: true,
    },

    effectiveDate: {
      type: String,
      default: "",
      trim: true,
      validate: ymdValidator,
    },

    reviewDate: {
      type: String,
      default: "",
      trim: true,
      validate: ymdValidator,
    },

    decisionDocumentNumber: {
      type: String,
      default: "",
      trim: true,
    },

    issuedBy: {
      type: String,
      default: "",
      trim: true,
    },

    issuedByUserId: {
      type: String,
      default: "",
      trim: true,
    },

    issuedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const AcknowledgementSchema =
  new mongoose.Schema(
    {
      required: {
        type: Boolean,
        default: false,
      },

      status: {
        type: String,
        enum: ACKNOWLEDGEMENT_STATUSES,
        default: "Not Required",
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

      receiptConfirmed: {
        type: Boolean,
        default: false,
      },

      comments: {
        type: String,
        default: "",
        trim: true,
      },
    },
    {
      _id: false,
    }
  );

const AppealSchema = new mongoose.Schema(
  {
    appealNumber: {
      type: String,
      required: true,
      trim: true,
    },

    grounds: {
      type: String,
      required: true,
      trim: true,
    },

    requestedOutcome: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: APPEAL_STATUSES,
      default: "Submitted",
    },

    submittedBy: {
      type: String,
      default: "",
      trim: true,
    },

    submittedByUserId: {
      type: String,
      default: "",
      trim: true,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },

    decision: {
      type: String,
      default: "",
      trim: true,
    },

    decisionReason: {
      type: String,
      default: "",
      trim: true,
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
  },
  {
    timestamps: true,
  }
);

const HistorySchema = new mongoose.Schema(
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
  {
    _id: true,
  }
);

const EmployeeRelationsCaseSchema =
  new mongoose.Schema(
    {
      caseNumber: {
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

      title: {
        type: String,
        required: true,
        trim: true,
      },

      summary: {
        type: String,
        required: true,
        trim: true,
      },

      category: {
        type: String,
        required: true,
        trim: true,
      },

      incidentDate: {
        type: String,
        default: "",
        trim: true,
        validate: ymdValidator,
      },

      reportedDate: {
        type: String,
        required: true,
        trim: true,
        validate: ymdValidator,
      },

      priority: {
        type: String,
        enum: PRIORITY_LEVELS,
        default: "Normal",
        index: true,
      },

      confidentialityLevel: {
        type: String,
        enum: CONFIDENTIALITY_LEVELS,
        default: "Restricted HR",
        index: true,
      },

      subjectEmployeeId: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      subjectLinkedUserId: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      subjectSnapshot: {
        type: PersonSnapshotSchema,
        default: () => ({}),
      },

      complainantEmployeeId: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      complainantLinkedUserId: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      complainantSnapshot: {
        type: PersonSnapshotSchema,
        default: () => ({}),
      },

      respondentEmployeeIds: [
        {
          type: String,
          trim: true,
        },
      ],

      allegations: [
        {
          allegationNumber: {
            type: String,
            required: true,
            trim: true,
          },

          description: {
            type: String,
            required: true,
            trim: true,
          },

          policyReference: {
            type: String,
            default: "",
            trim: true,
          },

          response: {
            type: String,
            default: "",
            trim: true,
          },

          finding: {
            type: String,
            enum: [
              "Pending",
              "Substantiated",
              "Partially Substantiated",
              "Not Substantiated",
              "Withdrawn",
            ],
            default: "Pending",
          },

          findingReason: {
            type: String,
            default: "",
            trim: true,
          },
        },
      ],

      requestedResolution: {
        type: String,
        default: "",
        trim: true,
      },

      interimMeasures: {
        type: String,
        default: "",
        trim: true,
      },

      assignedTo: {
        type: String,
        default: "",
        trim: true,
      },

      assignedToUserId: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      authorizedUserIds: [
        {
          type: String,
          trim: true,
        },
      ],

      status: {
        type: String,
        enum: CASE_STATUSES,
        default: "Draft",
        index: true,
      },

      evidence: {
        type: [EvidenceSchema],
        default: [],
      },

      hearings: {
        type: [HearingSchema],
        default: [],
      },

      decision: {
        type: DecisionSchema,
        default: () => ({}),
      },

      employeeAcknowledgement: {
        type: AcknowledgementSchema,
        default: () => ({}),
      },

      appeals: {
        type: [AppealSchema],
        default: [],
      },

      closureSummary: {
        type: String,
        default: "",
        trim: true,
      },

      closedBy: {
        type: String,
        default: "",
        trim: true,
      },

      closedByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      closedAt: {
        type: Date,
        default: null,
      },

      withdrawnBy: {
        type: String,
        default: "",
        trim: true,
      },

      withdrawnAt: {
        type: Date,
        default: null,
      },

      withdrawalReason: {
        type: String,
        default: "",
        trim: true,
      },

      legacyReference: {
        employeeId: {
          type: String,
          default: "",
          trim: true,
        },

        disciplineRecordId: {
          type: String,
          default: "",
          trim: true,
        },

        legacyArrayIndex: {
          type: Number,
          default: null,
        },

        migratedAt: {
          type: Date,
          default: null,
        },
      },

      createdBy: {
        type: String,
        default: "",
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

      history: {
        type: [HistorySchema],
        default: [],
      },
    },
    {
      timestamps: true,
    }
  );

EmployeeRelationsCaseSchema.index({
  caseType: 1,
  status: 1,
  reportedDate: -1,
});

EmployeeRelationsCaseSchema.index({
  subjectEmployeeId: 1,
  status: 1,
  createdAt: -1,
});

EmployeeRelationsCaseSchema.index({
  complainantEmployeeId: 1,
  status: 1,
  createdAt: -1,
});

EmployeeRelationsCaseSchema.index(
  {
    "legacyReference.employeeId": 1,
    "legacyReference.disciplineRecordId": 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      "legacyReference.employeeId": {
        $type: "string",
        $gt: "",
      },
      "legacyReference.disciplineRecordId": {
        $type: "string",
        $gt: "",
      },
    },
  }
);

EmployeeRelationsCaseSchema.pre(
  "validate",
  function validateEmployeeRelationsCase() {
    const validCategories =
      this.caseType === "Discipline"
        ? DISCIPLINE_CATEGORIES
        : GRIEVANCE_CATEGORIES;

    if (!validCategories.includes(this.category)) {
      throw new Error(
        `${
          this.category || "The selected category"
        } is not valid for a ${
          this.caseType || "controlled"
        } case.`
      );
    }

    if (
      this.caseType === "Discipline" &&
      !this.subjectEmployeeId
    ) {
      throw new Error(
        "A discipline case must identify the subject employee."
      );
    }

    if (
      this.caseType === "Grievance" &&
      !this.complainantEmployeeId
    ) {
      throw new Error(
        "A grievance case must identify the employee raising the grievance."
      );
    }

    if (
      this.incidentDate &&
      this.reportedDate &&
      this.incidentDate > this.reportedDate
    ) {
      throw new Error(
        "The incident date cannot be later than the reported date."
      );
    }

    if (
      this.employeeAcknowledgement?.required
    ) {
      if (
        this.employeeAcknowledgement.status ===
        "Not Required"
      ) {
        this.employeeAcknowledgement.status =
          "Pending";
      }
    } else {
      this.employeeAcknowledgement.status =
        "Not Required";
      this.employeeAcknowledgement.receiptConfirmed =
        false;
      this.employeeAcknowledgement.acknowledgedBy =
        "";
      this.employeeAcknowledgement.acknowledgedByUserId =
        "";
      this.employeeAcknowledgement.acknowledgedAt =
        null;
      this.employeeAcknowledgement.comments = "";
    }

    if (
      this.employeeAcknowledgement?.status ===
        "Acknowledged" &&
      !this.employeeAcknowledgement
        .receiptConfirmed
    ) {
      throw new Error(
        "A case acknowledgement must expressly confirm receipt."
      );
    }

    if (this.decision?.issued) {
      if (
        !this.decision.outcome ||
        !this.decision.summary
      ) {
        throw new Error(
          "An issued case decision requires an outcome and summary."
        );
      }

      if (!this.decision.issuedAt) {
        this.decision.issuedAt = new Date();
      }
    }

    if (
      this.status === "Closed" &&
      !this.closureSummary
    ) {
      throw new Error(
        "A closed employee-relations case requires a closure summary."
      );
    }
  }
);

module.exports = mongoose.model(
  "EmployeeRelationsCase",
  EmployeeRelationsCaseSchema
);