const mongoose = require("mongoose");

const REVIEW_TYPES = [
  "Annual",
  "Probation",
  "Quarterly",
  "Mid-Year",
  "Project",
  "Improvement Plan",
  "Other",
];

const REVIEW_STATUSES = [
  "Draft",
  "Goal Setting",
  "Self Assessment",
  "Manager Assessment",
  "HR Review",
  "Awaiting Acknowledgement",
  "Completed",
  "Improvement Plan",
  "Cancelled",
];

const RATING_LABELS = [
  "Not Rated",
  "Excellent",
  "Very Good",
  "Good",
  "Needs Improvement",
  "Unsatisfactory",
];

const GOAL_STATUSES = [
  "Not Started",
  "In Progress",
  "Completed",
  "Partially Completed",
  "Deferred",
  "Cancelled",
];

const IMPROVEMENT_PLAN_STATUSES = [
  "Not Required",
  "Draft",
  "Active",
  "Successfully Completed",
  "Unsuccessfully Completed",
  "Cancelled",
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
    },
    {
      _id: false,
    }
  );

const GoalSchema =
  new mongoose.Schema(
    {
      goalNumber: {
        type: String,
        required: true,
        trim: true,
      },

      title: {
        type: String,
        required: true,
        trim: true,
      },

      description: {
        type: String,
        required: true,
        trim: true,
      },

      successMeasure: {
        type: String,
        required: true,
        trim: true,
      },

      weightPercentage: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },

      targetDate: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator:
            isValidYmdDate,
          message:
            "Performance goal target date must use YYYY-MM-DD.",
        },
      },

      status: {
        type: String,
        enum: GOAL_STATUSES,
        default: "Not Started",
      },

      employeeProgressComments: {
        type: String,
        default: "",
        trim: true,
      },

      managerProgressComments: {
        type: String,
        default: "",
        trim: true,
      },

      employeeScore: {
        type: Number,
        default: null,
        min: 1,
        max: 5,
      },

      managerScore: {
        type: Number,
        default: null,
        min: 1,
        max: 5,
      },

      evidenceReferences: [
        {
          type: String,
          trim: true,
        },
      ],

      completedAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
    }
  );

const CompetencyAssessmentSchema =
  new mongoose.Schema(
    {
      competencyCode: {
        type: String,
        required: true,
        trim: true,
      },

      competencyName: {
        type: String,
        required: true,
        trim: true,
      },

      description: {
        type: String,
        default: "",
        trim: true,
      },

      weightPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },

      employeeScore: {
        type: Number,
        default: null,
        min: 1,
        max: 5,
      },

      employeeComments: {
        type: String,
        default: "",
        trim: true,
      },

      managerScore: {
        type: Number,
        default: null,
        min: 1,
        max: 5,
      },

      managerComments: {
        type: String,
        default: "",
        trim: true,
      },
    },
    {
      timestamps: true,
    }
  );

const AssessmentSchema =
  new mongoose.Schema(
    {
      status: {
        type: String,
        enum: [
          "Not Started",
          "In Progress",
          "Submitted",
          "Returned",
          "Completed",
        ],
        default: "Not Started",
      },

      strengths: {
        type: String,
        default: "",
        trim: true,
      },

      areasForImprovement: {
        type: String,
        default: "",
        trim: true,
      },

      overallComments: {
        type: String,
        default: "",
        trim: true,
      },

      proposedRating: {
        type: String,
        enum: RATING_LABELS,
        default: "Not Rated",
      },

      proposedScore: {
        type: Number,
        default: null,
        min: 1,
        max: 5,
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
        default: null,
      },

      returnedBy: {
        type: String,
        default: "",
        trim: true,
      },

      returnedAt: {
        type: Date,
        default: null,
      },

      returnReason: {
        type: String,
        default: "",
        trim: true,
      },
    },
    {
      _id: false,
    }
  );

const ImprovementPlanSchema =
  new mongoose.Schema(
    {
      required: {
        type: Boolean,
        default: false,
      },

      status: {
        type: String,
        enum:
          IMPROVEMENT_PLAN_STATUSES,
        default: "Not Required",
      },

      planNumber: {
        type: String,
        default: "",
        trim: true,
      },

      reason: {
        type: String,
        default: "",
        trim: true,
      },

      expectedImprovement: {
        type: String,
        default: "",
        trim: true,
      },

      supportProvided: {
        type: String,
        default: "",
        trim: true,
      },

      startDate: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator:
            isValidYmdDate,
          message:
            "Improvement-plan start date must use YYYY-MM-DD.",
        },
      },

      reviewDate: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator:
            isValidYmdDate,
          message:
            "Improvement-plan review date must use YYYY-MM-DD.",
        },
      },

      completionDate: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator:
            isValidYmdDate,
          message:
            "Improvement-plan completion date must use YYYY-MM-DD.",
        },
      },

      outcomeNotes: {
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

      createdAt: {
        type: Date,
        default: null,
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
    },
    {
      _id: false,
    }
  );

const HistorySchema =
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

const PerformanceReviewSchema =
  new mongoose.Schema(
    {
      reviewNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
        index: true,
      },

      cycleCode: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        index: true,
      },

      cycleName: {
        type: String,
        required: true,
        trim: true,
      },

      reviewType: {
        type: String,
        enum: REVIEW_TYPES,
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
        type:
          EmployeeSnapshotSchema,
        required: true,
      },

      managerEmployeeId: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      managerLinkedUserId: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      managerName: {
        type: String,
        default: "",
        trim: true,
      },

      periodStartDate: {
        type: String,
        required: true,
        trim: true,
        validate: {
          validator:
            isValidYmdDate,
          message:
            "Performance period start date must use YYYY-MM-DD.",
        },
      },

      periodEndDate: {
        type: String,
        required: true,
        trim: true,
        validate: {
          validator:
            isValidYmdDate,
          message:
            "Performance period end date must use YYYY-MM-DD.",
        },
      },

      goalSettingDueDate: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator:
            isValidYmdDate,
          message:
            "Goal-setting due date must use YYYY-MM-DD.",
        },
      },

      selfAssessmentDueDate: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator:
            isValidYmdDate,
          message:
            "Self-assessment due date must use YYYY-MM-DD.",
        },
      },

      managerAssessmentDueDate: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator:
            isValidYmdDate,
          message:
            "Manager-assessment due date must use YYYY-MM-DD.",
        },
      },

      acknowledgementDueDate: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator:
            isValidYmdDate,
          message:
            "Performance acknowledgement due date must use YYYY-MM-DD.",
        },
      },

      goals: {
        type: [GoalSchema],
        default: [],
      },

      competencies: {
        type:
          [CompetencyAssessmentSchema],
        default: [],
      },

      selfAssessment: {
        type: AssessmentSchema,
        default: () => ({}),
      },

      managerAssessment: {
        type: AssessmentSchema,
        default: () => ({}),
      },

      hrReview: {
        status: {
          type: String,
          enum: [
            "Pending",
            "Approved",
            "Returned",
          ],
          default: "Pending",
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

        notes: {
          type: String,
          default: "",
          trim: true,
        },

        returnReason: {
          type: String,
          default: "",
          trim: true,
        },
      },

      finalScore: {
        type: Number,
        default: null,
        min: 1,
        max: 5,
      },

      finalRating: {
        type: String,
        enum: RATING_LABELS,
        default: "Not Rated",
        index: true,
      },

      finalSummary: {
        type: String,
        default: "",
        trim: true,
      },

      developmentActions: {
        type: String,
        default: "",
        trim: true,
      },

      acknowledgementRequired: {
        type: Boolean,
        default: true,
      },

      employeeAcknowledgement: {
        status: {
          type: String,
          enum: [
            "Not Required",
            "Pending",
            "Acknowledged",
            "Acknowledged with Comments",
          ],
          default: "Pending",
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

      improvementPlan: {
        type: ImprovementPlanSchema,
        default: () => ({}),
      },

      status: {
        type: String,
        enum: REVIEW_STATUSES,
        default: "Draft",
        index: true,
      },

      submittedAt: {
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

      sourceType: {
        type: String,
        enum: [
          "Controlled Workflow",
          "Legacy Employee Record",
          "Other",
        ],
        default:
          "Controlled Workflow",
      },

      sourceReference: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      legacyReference: {
        legacyReviewId: {
          type: String,
          default: "",
          trim: true,
        },

        legacyArrayIndex: {
          type: Number,
          default: null,
          min: 0,
        },

        migratedAt: {
          type: Date,
          default: null,
        },

        acknowledgementReconfirmationRequired: {
          type: Boolean,
          default: false,
        },
      },

      history: {
        type: [HistorySchema],
        default: [],
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
    },
    {
      timestamps: true,
    }
  );

PerformanceReviewSchema.index({
  employeeId: 1,
  periodStartDate: -1,
  periodEndDate: -1,
});

PerformanceReviewSchema.index({
  cycleCode: 1,
  status: 1,
});

PerformanceReviewSchema.index({
  managerEmployeeId: 1,
  status: 1,
});

PerformanceReviewSchema.index({
  linkedUserId: 1,
  status: 1,
});

PerformanceReviewSchema.index(
  {
    employeeId: 1,
    sourceReference: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      sourceType:
        "Legacy Employee Record",
      sourceReference: {
        $type: "string",
        $gt: "",
      },
    },
  }
);

PerformanceReviewSchema.pre(
  "validate",
  function validatePerformanceReview() {
    if (
      this.periodStartDate &&
      this.periodEndDate &&
      this.periodEndDate <
        this.periodStartDate
    ) {
      throw new Error(
        "Performance period end date cannot be earlier than its start date."
      );
    }

    const goalNumbers =
      (this.goals || []).map(
        (goal) =>
          normalizeString(
            goal.goalNumber
          ).toUpperCase()
      );

    if (
      new Set(goalNumbers).size !==
      goalNumbers.length
    ) {
      throw new Error(
        "Performance goals cannot contain duplicate goal numbers."
      );
    }

    const goalWeight =
      (this.goals || []).reduce(
        (
          total,
          goal
        ) =>
          total +
          Number(
            goal.weightPercentage ||
              0
          ),
        0
      );

    if (goalWeight > 100) {
      throw new Error(
        "The combined performance-goal weight cannot exceed 100 percent."
      );
    }

    const competencyCodes =
      (this.competencies || []).map(
        (competency) =>
          normalizeString(
            competency
              .competencyCode
          ).toUpperCase()
      );

    if (
      new Set(
        competencyCodes
      ).size !==
      competencyCodes.length
    ) {
      throw new Error(
        "Performance competencies cannot contain duplicate competency codes."
      );
    }

    if (
      this.acknowledgementRequired &&
      this.employeeAcknowledgement
        ?.status ===
        "Not Required"
    ) {
      throw new Error(
        "A required performance acknowledgement cannot be marked Not Required."
      );
    }

    if (
      !this.acknowledgementRequired
    ) {
      this.employeeAcknowledgement.status =
        "Not Required";
    }

    if (
      this.improvementPlan
        ?.required &&
      this.improvementPlan
        .status ===
        "Not Required"
    ) {
      throw new Error(
        "A required improvement plan cannot use Not Required status."
      );
    }

    if (
      !this.improvementPlan
        ?.required
    ) {
      this.improvementPlan.status =
        "Not Required";
    }

    if (
      this.improvementPlan
        ?.startDate &&
      this.improvementPlan
        ?.reviewDate &&
      this.improvementPlan
        .reviewDate <
        this.improvementPlan
          .startDate
    ) {
      throw new Error(
        "Improvement-plan review date cannot be earlier than its start date."
      );
    }

    if (
      this.status ===
        "Completed" &&
      (
        this.finalRating ===
          "Not Rated" ||
        !this.finalScore
      )
    ) {
      throw new Error(
        "A completed performance review requires a final score and rating."
      );
    }

    if (
      this.status ===
        "Cancelled" &&
      !normalizeString(
        this.cancellationReason
      )
    ) {
      throw new Error(
        "A cancelled performance review requires a cancellation reason."
      );
    }
  }
);

module.exports = mongoose.model(
  "PerformanceReview",
  PerformanceReviewSchema
);