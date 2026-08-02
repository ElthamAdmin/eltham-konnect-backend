const mongoose = require("mongoose");

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
  "Medical",
  "Qualification",
  "Work Permit",
  "Background Check",
  "Tax",
  "Other",
];

const DOCUMENT_STATUSES = [
  "Draft",
  "Pending Verification",
  "Verified",
  "Rejected",
  "Expired",
  "Superseded",
  "Archived",
  "Cancelled",
];

const CONFIDENTIALITY_LEVELS = [
  "Employee Visible",
  "HR Restricted",
  "Highly Restricted",
];

const STORAGE_PROVIDERS = [
  "Local",
  "Cloudinary",
  "Amazon S3",
  "Azure Blob",
  "Other",
];

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

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
    date.toISOString().slice(0, 10) ===
      text
  );
};

const actorSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        default: "",
        trim: true,
      },

      userId: {
        type: String,
        default: "",
        trim: true,
      },

      at: {
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

const fileSchema =
  new mongoose.Schema(
    {
      storageProvider: {
        type: String,
        enum: STORAGE_PROVIDERS,
        default: "Local",
      },

      storageKey: {
        type: String,
        required: true,
        trim: true,
      },

      fileUrl: {
        type: String,
        default: "",
        trim: true,
      },

      originalFileName: {
        type: String,
        required: true,
        trim: true,
      },

      storedFileName: {
        type: String,
        default: "",
        trim: true,
      },

      mimeType: {
        type: String,
        required: true,
        trim: true,
      },

      sizeBytes: {
        type: Number,
        required: true,
        min: 1,
      },

      checksumSha256: {
        type: String,
        default: "",
        trim: true,
        lowercase: true,
      },
    },
    {
      _id: false,
    }
  );

const versionSchema =
  new mongoose.Schema(
    {
      versionNumber: {
        type: Number,
        required: true,
        min: 1,
      },

      file: {
        type: fileSchema,
        required: true,
      },

      changeReason: {
        type: String,
        required: true,
        trim: true,
      },

      uploadedBy: {
        type: String,
        required: true,
        trim: true,
      },

      uploadedByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      uploadedAt: {
        type: Date,
        default: Date.now,
      },

      active: {
        type: Boolean,
        default: true,
      },
    },
    {
      _id: true,
    }
  );

const historySchema =
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

      notes: {
        type: String,
        default: "",
        trim: true,
      },
    },
    {
      _id: true,
    }
  );

const EmploymentDocumentSchema =
  new mongoose.Schema(
    {
      documentNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
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
      },

      documentName: {
        type: String,
        required: true,
        trim: true,
      },

      documentType: {
        type: String,
        enum: DOCUMENT_TYPES,
        required: true,
        index: true,
      },

      description: {
        type: String,
        default: "",
        trim: true,
      },

      confidentialityLevel: {
        type: String,
        enum: CONFIDENTIALITY_LEVELS,
        default: "Employee Visible",
        index: true,
      },

      employeeCanDownload: {
        type: Boolean,
        default: true,
      },

      issueDate: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator: isValidYmdDate,
          message:
            "Document issue date must use YYYY-MM-DD.",
        },
      },

      effectiveDate: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator: isValidYmdDate,
          message:
            "Document effective date must use YYYY-MM-DD.",
        },
      },

      expiryDate: {
        type: String,
        default: "",
        trim: true,
        index: true,
        validate: {
          validator: isValidYmdDate,
          message:
            "Document expiry date must use YYYY-MM-DD.",
        },
      },

      expiryTrackingRequired: {
        type: Boolean,
        default: false,
      },

      reminderDaysBeforeExpiry: {
        type: [Number],
        default: [90, 30, 7],
        validate: {
          validator: (values) =>
            values.every(
              (value) =>
                Number.isInteger(value) &&
                value >= 0
            ),
          message:
            "Document reminder days must be non-negative whole numbers.",
        },
      },

      lastExpiryReminderAt: {
        type: Date,
        default: null,
      },

      acknowledgementRequired: {
        type: Boolean,
        default: false,
      },

      acknowledgementDueDate: {
        type: String,
        default: "",
        trim: true,
        validate: {
          validator: isValidYmdDate,
          message:
            "Document acknowledgement due date must use YYYY-MM-DD.",
        },
      },

      acknowledgement: {
        status: {
          type: String,
          enum: [
            "Not Required",
            "Pending",
            "Acknowledged",
            "Declined",
          ],
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

        comments: {
          type: String,
          default: "",
          trim: true,
        },
      },

      status: {
        type: String,
        enum: DOCUMENT_STATUSES,
        default: "Draft",
        index: true,
      },

      verification: {
        status: {
          type: String,
          enum: [
            "Pending",
            "Verified",
            "Rejected",
            "Not Required",
          ],
          default: "Pending",
        },

        verifiedBy: {
          type: String,
          default: "",
          trim: true,
        },

        verifiedByUserId: {
          type: String,
          default: "",
          trim: true,
        },

        verifiedAt: {
          type: Date,
          default: null,
        },

        rejectionReason: {
          type: String,
          default: "",
          trim: true,
        },

        notes: {
          type: String,
          default: "",
          trim: true,
        },
      },

      currentVersionNumber: {
        type: Number,
        default: 1,
        min: 1,
      },

      versions: {
        type: [versionSchema],
        default: [],
      },

      supersedesDocumentNumber: {
        type: String,
        default: "",
        trim: true,
        uppercase: true,
      },

      supersededByDocumentNumber: {
        type: String,
        default: "",
        trim: true,
        uppercase: true,
      },

      sourceType: {
        type: String,
        enum: [
          "New Upload",
          "Legacy Employee Record",
          "Leave Request",
          "Discipline",
          "Performance",
          "Onboarding",
          "Offboarding",
          "Other",
        ],
        default: "New Upload",
      },

      sourceReference: {
        type: String,
        default: "",
        trim: true,
      },

      legacyReference: {
        employeeDocumentId: {
          type: String,
          default: "",
          trim: true,
        },

        legacyArrayIndex: {
          type: Number,
          default: null,
          min: 0,
        },

        legacyFileUrl: {
          type: String,
          default: "",
          trim: true,
        },

        migratedAt: {
          type: Date,
          default: null,
        },
      },

      archived: {
        type: Boolean,
        default: false,
        index: true,
      },

      archivedBy: {
        type: String,
        default: "",
        trim: true,
      },

      archivedAt: {
        type: Date,
        default: null,
      },

      archiveReason: {
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

      lastAccessedAt: {
        type: Date,
        default: null,
      },

      lastAccessedBy: {
        type: String,
        default: "",
        trim: true,
      },

      accessCount: {
        type: Number,
        default: 0,
        min: 0,
      },

      history: {
        type: [historySchema],
        default: [],
      },
    },
    {
      timestamps: true,
    }
  );

EmploymentDocumentSchema.index({
  employeeId: 1,
  status: 1,
  documentType: 1,
});

EmploymentDocumentSchema.index({
  expiryTrackingRequired: 1,
  expiryDate: 1,
  status: 1,
});

EmploymentDocumentSchema.index({
  linkedUserId: 1,
  confidentialityLevel: 1,
  status: 1,
});

EmploymentDocumentSchema.index(
  {
    employeeId: 1,
    "legacyReference.legacyFileUrl": 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      "legacyReference.legacyFileUrl": {
        $type: "string",
        $gt: "",
      },
    },
  }
);

EmploymentDocumentSchema.pre(
  "validate",
  function validateDocument() {
    if (
      this.issueDate &&
      this.expiryDate &&
      this.expiryDate <
        this.issueDate
    ) {
      this.invalidate(
        "expiryDate",
        "Document expiry date cannot be earlier than its issue date."
      );
    }

    if (
      this.effectiveDate &&
      this.expiryDate &&
      this.expiryDate <
        this.effectiveDate
    ) {
      this.invalidate(
        "expiryDate",
        "Document expiry date cannot be earlier than its effective date."
      );
    }

    if (
      this.expiryTrackingRequired &&
      !this.expiryDate
    ) {
      this.invalidate(
        "expiryDate",
        "An expiry date is required when expiry tracking is enabled."
      );
    }

    this.reminderDaysBeforeExpiry =
      Array.from(
        new Set(
          (
            this
              .reminderDaysBeforeExpiry ||
            []
          ).map(Number)
        )
      ).sort(
        (first, second) =>
          second - first
      );

    if (
      this.acknowledgementRequired
    ) {
      if (
        this.acknowledgement
          .status === "Not Required"
      ) {
        this.acknowledgement.status =
          "Pending";
      }
    } else {
      this.acknowledgement.status =
        "Not Required";
    }

    if (
      this.confidentialityLevel !==
      "Employee Visible"
    ) {
      this.employeeCanDownload =
        false;
    }

    if (
      this.status === "Verified"
    ) {
      this.verification.status =
        "Verified";

      if (
        !this.verification.verifiedAt
      ) {
        this.verification.verifiedAt =
          new Date();
      }
    }

    if (
      this.status === "Rejected" &&
      !this.verification
        .rejectionReason
    ) {
      this.invalidate(
        "verification.rejectionReason",
        "A document rejection reason is required."
      );
    }

    if (
      this.versions.length > 0
    ) {
      const activeVersions =
        this.versions.filter(
          (version) =>
            version.active
        );

      if (
        activeVersions.length !== 1
      ) {
        this.invalidate(
          "versions",
          "A controlled document must have exactly one active version."
        );
      }

      const highestVersion =
        Math.max(
          ...this.versions.map(
            (version) =>
              Number(
                version.versionNumber
              )
          )
        );

      if (
        Number(
          this.currentVersionNumber
        ) !== highestVersion
      ) {
        this.invalidate(
          "currentVersionNumber",
          "The current document version must be the highest recorded version."
        );
      }
    }

    if (this.archived) {
      this.status = "Archived";

      if (!this.archivedAt) {
        this.archivedAt =
          new Date();
      }
    }
  }
);

module.exports = mongoose.model(
  "EmploymentDocument",
  EmploymentDocumentSchema
);