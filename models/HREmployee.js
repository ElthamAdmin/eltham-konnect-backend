const mongoose = require("mongoose");

const BRANCHES = ["Eltham Park Mainstore", "Brown's Town Square"];

const DEPARTMENTS = [
  "Operations",
  "Customer Service",
  "Accounts",
  "Marketing",
  "Warehouse",
  "Administration",
];

const EMPLOYMENT_TYPES = [
  "Permanent",
  "Temporary",
  "Part-Time",
  "Contract",
  "Probation",
];

const EMPLOYMENT_STATUSES = ["Active", "Inactive", "On Leave", "Terminated"];

const PAY_TYPES = [
  "Monthly Salary",
  "Weekly Wage",
  "Daily Rate",
  "Hourly Rate",
];

const EMPLOYMENT_CLASSIFICATIONS = [
  "",
  "Full-Time",
  "Part-Time",
  "Casual",
  "Seasonal",
  "Apprentice",
  "Intern",
  "Other",
];

const CONTRACT_TYPES = [
  "",
  "Permanent",
  "Fixed-Term",
  "Temporary",
  "Casual",
  "Probationary",
  "Independent Contractor",
  "Other",
];

const COMPENSATION_TYPES = [
  "",
  "Salary",
  "Wage",
  "Stipend",
  "Allowance",
  "Other",
];

const PAY_FREQUENCIES = [
  "",
  "Weekly",
  "Fortnightly",
  "Semi-Monthly",
  "Monthly",
  "Annual",
];

const WORKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const PROBATION_STATUSES = [
  "Not Applicable",
  "Pending",
  "In Progress",
  "Review Due",
  "Completed",
  "Extended",
  "Failed",
];

const PAYROLL_ELIGIBILITY_STATUSES = [
  "Pending Review",
  "Eligible",
  "On Hold",
  "Not Eligible",
];

const DOCUMENT_TYPES = [
  "Contract",
  "Job Letter",
  "Warning Letter",
  "ID",
  "TRN",
  "NIS",
  "Payslip",
  "Policy",
  "Handbook",
  "Other",
];

const DISCIPLINE_TYPES = [
  "Verbal Warning",
  "Written Warning",
  "Incident Report",
  "Suspension",
  "Final Warning",
  "Termination Notice",
  "Other",
];

const PERFORMANCE_RATINGS = [
  "Excellent",
  "Very Good",
  "Good",
  "Needs Improvement",
  "Unsatisfactory",
];

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeTrn = (value) =>
  String(value || "").replace(/\D/g, "");

const normalizeNisNumber = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

const isValidYmdDate = (value) => {
  const text = String(value || "").trim();

  if (!YMD_PATTERN.test(text)) {
    return false;
  }

  const date = new Date(`${text}T12:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === text
  );
};

const HREmployeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    employeeCode: {
      type: String,
      default: "",
      trim: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    firstName: {
      type: String,
      default: "",
      trim: true,
    },

    lastName: {
      type: String,
      default: "",
      trim: true,
    },

    gender: {
      type: String,
      enum: ["Male", "Female", "Other", ""],
      default: "",
    },

    dateOfBirth: {
      type: String,
      default: "",
    },

    trn: {
      type: String,
      default: "",
      trim: true,
    },

    nisNumber: {
      type: String,
      default: "",
      trim: true,
    },

    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    alternatePhone: {
      type: String,
      default: "",
      trim: true,
    },

    address: {
      type: String,
      default: "",
      trim: true,
    },

    emergencyContactName: {
      type: String,
      default: "",
      trim: true,
    },

    emergencyContactPhone: {
      type: String,
      default: "",
      trim: true,
    },

    emergencyContactRelationship: {
      type: String,
      default: "",
      trim: true,
    },

    department: {
      type: String,
      enum: DEPARTMENTS,
      default: "Operations",
      trim: true,
    },

    jobTitle: {
  type: String,
  required: true,
  trim: true,
},

jobLevel: {
  type: Number,
  default: 1,
  min: 1,
  max: 10,
},

isDepartmentHead: {
  type: Boolean,
  default: false,
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

    branch: {
      type: String,
      enum: BRANCHES,
      default: "Eltham Park Mainstore",
      trim: true,
    },

        employmentType: {
      type: String,
      enum: EMPLOYMENT_TYPES,
      default: "Temporary",
    },

    employmentClassification: {
      type: String,
      enum: EMPLOYMENT_CLASSIFICATIONS,
      default: "",
      index: true,
    },

    contractType: {
      type: String,
      enum: CONTRACT_TYPES,
      default: "",
      index: true,
    },

    startDate: {
      type: String,
      default: "",
    },

        endDate: {
      type: String,
      default: "",
    },

    probation: {
      applicable: {
        type: Boolean,
        default: false,
      },

      startDate: {
        type: String,
        default: "",
      },

      endDate: {
        type: String,
        default: "",
      },

      durationMonths: {
        type: Number,
        default: 0,
        min: 0,
        max: 24,
      },

      status: {
        type: String,
        enum: PROBATION_STATUSES,
        default: "Not Applicable",
      },

      reviewDueDate: {
        type: String,
        default: "",
      },

      completedDate: {
        type: String,
        default: "",
      },

      notes: {
        type: String,
        default: "",
        trim: true,
      },
    },

    normalWorkingHours: {
      hoursPerDay: {
        type: Number,
        default: 0,
        min: 0,
        max: 24,
      },

      hoursPerWeek: {
        type: Number,
        default: 0,
        min: 0,
        max: 168,
      },
    },

    scheduledWorkdays: [
      {
        type: String,
        enum: WORKDAYS,
      },
    ],

    employmentStatus: {
      type: String,
      enum: EMPLOYMENT_STATUSES,
      default: "Active",
    },

    payType: {
      type: String,
      enum: PAY_TYPES,
      default: "Monthly Salary",
    },

        payRate: {
      type: Number,
      default: 0,
      min: 0,
    },

    compensationType: {
      type: String,
      enum: COMPENSATION_TYPES,
      default: "",
      index: true,
    },

    payFrequency: {
      type: String,
      enum: PAY_FREQUENCIES,
      default: "",
      index: true,
    },

        payrollEnabled: {
      type: Boolean,
      default: true,
    },

    payrollEligibilityStatus: {
      type: String,
      enum: PAYROLL_ELIGIBILITY_STATUSES,
      default: "Pending Review",
      index: true,
    },

    payrollEligibilityReason: {
      type: String,
      default: "",
      trim: true,
    },

    payrollEligibilityEffectiveFrom: {
      type: String,
      default: "",
    },

    payrollEligibilityEffectiveTo: {
      type: String,
      default: "",
    },

    payrollEligibilityReviewedBy: {
      type: String,
      default: "",
      trim: true,
    },

    payrollEligibilityReviewedAt: {
      type: Date,
      default: null,
    },

    linkedUserId: {
      type: String,
      default: "",
      trim: true,
    },

    linkedUserName: {
      type: String,
      default: "",
      trim: true,
    },

    linkedUserRole: {
      type: String,
      default: "",
      trim: true,
    },

    attendanceRequired: {
      type: Boolean,
      default: true,
    },

    leaveBalanceVacation: {
      type: Number,
      default: 0,
      min: 0,
    },

    leaveBalanceSick: {
      type: Number,
      default: 0,
      min: 0,
    },

    leaveBalanceUnpaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    documents: [
      {
        documentName: {
          type: String,
          default: "",
          trim: true,
        },
        documentType: {
          type: String,
          enum: DOCUMENT_TYPES,
          default: "Other",
        },
        fileUrl: {
          type: String,
          default: "",
          trim: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    disciplineRecords: [
  {
    recordId: {
      type: String,
      default: "",
      trim: true,
    },
    disciplineType: {
      type: String,
      enum: DISCIPLINE_TYPES,
      default: "Other",
    },
    subject: {
      type: String,
      default: "",
      trim: true,
    },
    details: {
      type: String,
      default: "",
      trim: true,
    },
    actionTaken: {
      type: String,
      default: "",
      trim: true,
    },
    incidentDate: {
      type: String,
      default: "",
      trim: true,
    },
    issuedDate: {
      type: String,
      default: "",
      trim: true,
    },
    issuedBy: {
      type: String,
      default: "",
      trim: true,
    },
    employeeAcknowledged: {
      type: Boolean,
      default: false,
    },
    employeeAcknowledgedAt: {
      type: Date,
      default: null,
    },
  },
],

performanceReviews: [
  {
    reviewId: {
      type: String,
      default: "",
      trim: true,
    },
    reviewPeriod: {
      type: String,
      default: "",
      trim: true,
    },
    reviewDate: {
      type: String,
      default: "",
      trim: true,
    },
    rating: {
      type: String,
      enum: PERFORMANCE_RATINGS,
      default: "Good",
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
    goals: {
      type: String,
      default: "",
      trim: true,
    },
    managerComments: {
      type: String,
      default: "",
      trim: true,
    },
    employeeComments: {
      type: String,
      default: "",
      trim: true,
    },
    reviewedBy: {
      type: String,
      default: "",
      trim: true,
    },
    employeeAcknowledged: {
      type: Boolean,
      default: false,
    },
    employeeAcknowledgedAt: {
      type: Date,
      default: null,
    },
  },
],

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

HREmployeeSchema.pre("validate", function () {
  if (this.trn) {
    this.trn = normalizeTrn(this.trn);

    if (this.trn.length !== 9) {
      this.invalidate(
        "trn",
        "Employee TRN must contain exactly nine digits."
      );
    }
  }

  if (this.nisNumber) {
    this.nisNumber = normalizeNisNumber(
      this.nisNumber
    );

    if (
      !/^[A-Z0-9][A-Z0-9 /-]{4,24}$/.test(
        this.nisNumber
      )
    ) {
      this.invalidate(
        "nisNumber",
        "NIS number contains unsupported characters or length."
      );
    }
  }

  const dateFields = [
    "dateOfBirth",
    "startDate",
    "endDate",
    "payrollEligibilityEffectiveFrom",
    "payrollEligibilityEffectiveTo",
  ];

  for (const fieldName of dateFields) {
    const value = String(
      this.get(fieldName) || ""
    ).trim();

    if (value && !isValidYmdDate(value)) {
      this.invalidate(
        fieldName,
        `${fieldName} must use a valid YYYY-MM-DD date.`
      );
    }
  }

  if (
    this.startDate &&
    this.endDate &&
    this.endDate < this.startDate
  ) {
    this.invalidate(
      "endDate",
      "Employment end date cannot be earlier than the start date."
    );
  }

  if (
    this.payrollEligibilityEffectiveFrom &&
    this.payrollEligibilityEffectiveTo &&
    this.payrollEligibilityEffectiveTo <
      this.payrollEligibilityEffectiveFrom
  ) {
    this.invalidate(
      "payrollEligibilityEffectiveTo",
      "Payroll eligibility end date cannot be earlier than its effective date."
    );
  }

  if (this.probation) {
    const probationDateFields = [
      "startDate",
      "endDate",
      "reviewDueDate",
      "completedDate",
    ];

    for (const fieldName of probationDateFields) {
      const value = String(
        this.probation[fieldName] || ""
      ).trim();

      if (value && !isValidYmdDate(value)) {
        this.invalidate(
          `probation.${fieldName}`,
          `Probation ${fieldName} must use a valid YYYY-MM-DD date.`
        );
      }
    }

    if (
      this.probation.startDate &&
      this.probation.endDate &&
      this.probation.endDate <
        this.probation.startDate
    ) {
      this.invalidate(
        "probation.endDate",
        "Probation end date cannot be earlier than its start date."
      );
    }

    if (
      this.probation.applicable &&
      this.probation.status ===
        "Not Applicable"
    ) {
      this.invalidate(
        "probation.status",
        "Applicable probation cannot use Not Applicable status."
      );
    }

    if (
      !this.probation.applicable &&
      this.probation.status !==
        "Not Applicable"
    ) {
      this.invalidate(
        "probation.status",
        "A non-applicable probation period must use Not Applicable status."
      );
    }
  }

  const uniqueWorkdays = [
    ...new Set(this.scheduledWorkdays || []),
  ];

  this.scheduledWorkdays = uniqueWorkdays;

  const hoursPerDay = Number(
    this.normalWorkingHours?.hoursPerDay || 0
  );

  const hoursPerWeek = Number(
    this.normalWorkingHours?.hoursPerWeek || 0
  );

  if (
    hoursPerDay > 0 &&
    hoursPerWeek > 0 &&
    hoursPerWeek < hoursPerDay
  ) {
    this.invalidate(
      "normalWorkingHours.hoursPerWeek",
      "Normal weekly hours cannot be less than normal daily hours."
    );
  }

  if (
    this.payrollEligibilityStatus ===
      "Eligible" &&
    !this.payrollEnabled
  ) {
    this.invalidate(
      "payrollEligibilityStatus",
      "An employee cannot be payroll eligible while payroll is disabled."
    );
  }
});

module.exports = mongoose.model(
  "HREmployee",
  HREmployeeSchema
);