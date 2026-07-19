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

module.exports = mongoose.model("HREmployee", HREmployeeSchema);