const EmploymentDocument = require(
  "../models/EmploymentDocument"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const REVIEWABLE_STATUSES = [
  "Draft",
  "Pending Verification",
];

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const getUserId = (user) =>
  String(
    user?._id ||
      user?.userId ||
      user?.id ||
      ""
  ).trim();

const normalizeDocumentNumber = (
  value
) => String(value || "").trim().toUpperCase();

const hasOwn = (source, key) =>
  Object.prototype.hasOwnProperty.call(
    source,
    key
  );

const normalizeBoolean = (
  value,
  fallback = false
) => {
  if (
    value === true ||
    value === "true"
  ) {
    return true;
  }

  if (
    value === false ||
    value === "false"
  ) {
    return false;
  }

  return fallback;
};

const sanitizeReminderDays = (
  value,
  fallback = []
) => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return [
    ...new Set(
      value
        .map((item) =>
          Number(item)
        )
        .filter(
          (item) =>
            Number.isFinite(item) &&
            item >= 0
        )
        .map((item) =>
          Math.round(item)
        )
    ),
  ].sort((left, right) => right - left);
};

const serializeControlledDocument = (
  document
) => {
  const source =
    typeof document?.toObject ===
    "function"
      ? document.toObject()
      : document;

  return {
    documentNumber:
      source.documentNumber,
    employeeId: source.employeeId,
    linkedUserId:
      source.linkedUserId || "",
    employeeSnapshot:
      source.employeeSnapshot || {},

    documentName:
      source.documentName,
    documentType:
      source.documentType,
    description:
      source.description || "",

    confidentialityLevel:
      source.confidentialityLevel,
    employeeCanDownload: Boolean(
      source.employeeCanDownload
    ),

    issueDate:
      source.issueDate || "",
    effectiveDate:
      source.effectiveDate || "",
    expiryDate:
      source.expiryDate || "",
    expiryTrackingRequired: Boolean(
      source.expiryTrackingRequired
    ),
    reminderDaysBeforeExpiry:
      source.reminderDaysBeforeExpiry ||
      [],
    lastExpiryReminderAt:
      source.lastExpiryReminderAt ||
      null,

    acknowledgementRequired:
      Boolean(
        source
          .acknowledgementRequired
      ),
    acknowledgementDueDate:
      source.acknowledgementDueDate ||
      "",
    acknowledgement:
      source.acknowledgement || {},

    status: source.status,
    verification:
      source.verification || {},

    currentVersionNumber:
      source.currentVersionNumber,
    versions: (
      source.versions || []
    ).map((version) => ({
      _id: version._id,
      versionNumber:
        version.versionNumber,
      changeReason:
        version.changeReason || "",
      uploadedBy:
        version.uploadedBy || "",
      uploadedAt:
        version.uploadedAt || null,
      active: Boolean(version.active),
      file: {
        originalFileName:
          version.file
            ?.originalFileName ||
          "",
        mimeType:
          version.file?.mimeType ||
          "",
        sizeBytes:
          Number(
            version.file?.sizeBytes ||
              0
          ),
        checksumSha256:
          version.file
            ?.checksumSha256 ||
          "",
        storageProvider:
          version.file
            ?.storageProvider ||
          "",
      },
    })),

    sourceType:
      source.sourceType || "",
    sourceReference:
      source.sourceReference || "",
    legacyReference:
      source.legacyReference ||
      null,

    archived: Boolean(
      source.archived
    ),
    archivedBy:
      source.archivedBy || "",
    archivedAt:
      source.archivedAt || null,
    archiveReason:
      source.archiveReason || "",

    createdBy:
      source.createdBy || "",
    createdByUserId:
      source.createdByUserId || "",
    updatedBy:
      source.updatedBy || "",

    lastAccessedAt:
      source.lastAccessedAt || null,
    lastAccessedBy:
      source.lastAccessedBy || "",
    accessCount:
      Number(
        source.accessCount || 0
      ),

    history:
      source.history || [],

    createdAt:
      source.createdAt,
    updatedAt:
      source.updatedAt,
  };
};

const buildAuditSnapshot = (
  document
) => ({
  documentNumber:
    document.documentNumber,
  employeeId:
    document.employeeId,
  documentName:
    document.documentName,
  documentType:
    document.documentType,
  description:
    document.description || "",
  confidentialityLevel:
    document.confidentialityLevel,
  employeeCanDownload:
    document.employeeCanDownload,
  issueDate:
    document.issueDate || "",
  effectiveDate:
    document.effectiveDate || "",
  expiryDate:
    document.expiryDate || "",
  expiryTrackingRequired:
    document.expiryTrackingRequired,
  reminderDaysBeforeExpiry:
    document
      .reminderDaysBeforeExpiry ||
    [],
  acknowledgementRequired:
    document
      .acknowledgementRequired,
  acknowledgementDueDate:
    document
      .acknowledgementDueDate ||
    "",
  status: document.status,
  verification:
    document.verification,
  currentVersionNumber:
    document.currentVersionNumber,
  archived:
    document.archived,
});

const appendHistory = ({
  document,
  action,
  fromStatus,
  toStatus,
  notes,
  user,
}) => {
  document.history =
    document.history || [];

  document.history.push({
    action,
    fromStatus,
    toStatus,
    performedBy:
      getUserName(user),
    performedByUserId:
      getUserId(user),
    performedAt: new Date(),
    notes:
      String(notes || "").trim(),
  });
};

const findControlledDocument = async (
  documentNumber
) =>
  EmploymentDocument.findOne({
    documentNumber:
      normalizeDocumentNumber(
        documentNumber
      ),
  });

const ensureDocumentExists = (
  document,
  res
) => {
  if (document) {
    return true;
  }

  res.status(404).json({
    success: false,
    message:
      "Controlled employment document was not found.",
  });

  return false;
};

const ensureNotArchived = (
  document,
  res
) => {
  if (
    !document.archived &&
    document.status !== "Archived" &&
    document.status !== "Cancelled"
  ) {
    return true;
  }

  res.status(409).json({
    success: false,
    message:
      `${document.documentNumber} cannot be changed while it is archived or cancelled.`,
    data: {
      documentNumber:
        document.documentNumber,
      currentStatus:
        document.status,
      archived: Boolean(
        document.archived
      ),
    },
  });

  return false;
};

const ensureReviewableStatus = (
  document,
  res
) => {
  if (
    REVIEWABLE_STATUSES.includes(
      document.status
    )
  ) {
    return true;
  }

  res.status(409).json({
    success: false,
    message:
      `${document.documentNumber} cannot be edited while its status is ${document.status}.`,
    data: {
      documentNumber:
        document.documentNumber,
      currentStatus:
        document.status,
      allowedStatuses:
        REVIEWABLE_STATUSES,
    },
  });

  return false;
};

const updateControlledDocumentMetadata =
  async (req, res) => {
    try {
      const document =
        await findControlledDocument(
          req.params.documentNumber
        );

      if (
        !ensureDocumentExists(
          document,
          res
        ) ||
        !ensureNotArchived(
          document,
          res
        ) ||
        !ensureReviewableStatus(
          document,
          res
        )
      ) {
        return;
      }

      const updateReason =
        String(
          req.body.updateReason || ""
        ).trim();

      if (!updateReason) {
        return res.status(400).json({
          success: false,
          message:
            "A metadata update reason is required.",
        });
      }

      const beforeValues =
        buildAuditSnapshot(document);

      let changed = false;

      const stringFields = [
        "documentName",
        "documentType",
        "description",
        "confidentialityLevel",
        "issueDate",
        "effectiveDate",
        "expiryDate",
        "acknowledgementDueDate",
      ];

      stringFields.forEach((field) => {
        if (hasOwn(req.body, field)) {
          document[field] =
            String(
              req.body[field] || ""
            ).trim();

          changed = true;
        }
      });

      if (
        hasOwn(
          req.body,
          "employeeCanDownload"
        )
      ) {
        document.employeeCanDownload =
          normalizeBoolean(
            req.body
              .employeeCanDownload,
            document
              .employeeCanDownload
          );

        changed = true;
      }

      if (
        hasOwn(
          req.body,
          "expiryTrackingRequired"
        )
      ) {
        document.expiryTrackingRequired =
          normalizeBoolean(
            req.body
              .expiryTrackingRequired,
            document
              .expiryTrackingRequired
          );

        changed = true;
      }

      if (
        hasOwn(
          req.body,
          "acknowledgementRequired"
        )
      ) {
        document.acknowledgementRequired =
          normalizeBoolean(
            req.body
              .acknowledgementRequired,
            document
              .acknowledgementRequired
          );

        changed = true;
      }

      if (
        hasOwn(
          req.body,
          "reminderDaysBeforeExpiry"
        )
      ) {
        document.reminderDaysBeforeExpiry =
          sanitizeReminderDays(
            req.body
              .reminderDaysBeforeExpiry,
            document
              .reminderDaysBeforeExpiry
          );

        changed = true;
      }

      if (!changed) {
        return res.status(400).json({
          success: false,
          message:
            "No supported document metadata fields were supplied.",
        });
      }

      if (
        !document.expiryTrackingRequired
      ) {
        document.expiryDate = "";
        document.lastExpiryReminderAt =
          null;
      }

      if (
        !document
          .acknowledgementRequired
      ) {
        document
          .acknowledgementDueDate = "";
      }

      document.updatedBy =
        getUserName(req.user);

      appendHistory({
        document,
        action: "Metadata Updated",
        fromStatus:
          document.status,
        toStatus:
          document.status,
        notes: updateReason,
        user: req.user,
      });

      await document.save();

      const afterValues =
        buildAuditSnapshot(document);

      await writeAuditLog({
        req,
        action:
          "UPDATE_EMPLOYMENT_DOCUMENT_METADATA",
        module: "HR",
        description:
          `Controlled employment document ${document.documentNumber} metadata updated.`,
        targetType:
          "EmploymentDocument",
        targetId:
          document.documentNumber,
        beforeValues,
        afterValues,
        metadata: {
          employeeId:
            document.employeeId,
          updateReason,
        },
      });

      return res.json({
        success: true,
        message:
          "Controlled employment-document metadata updated successfully.",
        data:
          serializeControlledDocument(
            document
          ),
      });
    } catch (error) {
      console.error(
        "Update controlled employment document metadata error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Failed to update controlled employment-document metadata.",
      });
    }
  };

const verifyControlledDocument =
  async (req, res) => {
    try {
      const document =
        await findControlledDocument(
          req.params.documentNumber
        );

      if (
        !ensureDocumentExists(
          document,
          res
        ) ||
        !ensureNotArchived(
          document,
          res
        )
      ) {
        return;
      }

      if (
        document.status !==
        "Pending Verification"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} must have Pending Verification status before HR verification.`,
          data: {
            documentNumber:
              document.documentNumber,
            currentStatus:
              document.status,
            requiredStatus:
              "Pending Verification",
          },
        });
      }

      const verificationNotes =
        String(
          req.body
            .verificationNotes || ""
        ).trim();

      if (!verificationNotes) {
        return res.status(400).json({
          success: false,
          message:
            "HR verification notes are required.",
        });
      }

      const activeVersion =
        (
          document.versions || []
        ).find(
          (version) =>
            version.active === true
        );

      if (
        !activeVersion ||
        !activeVersion.file ||
        !String(
          activeVersion.file
            .storageKey || ""
        ).trim() ||
        !String(
          activeVersion.file
            .checksumSha256 || ""
        ).trim()
      ) {
        return res.status(409).json({
          success: false,
          message:
            "The document cannot be verified because its active controlled file or checksum is unavailable.",
        });
      }

      const beforeValues =
        buildAuditSnapshot(document);

      const previousStatus =
        document.status;
      const verifiedAt =
        new Date();
      const userName =
        getUserName(req.user);
      const userId =
        getUserId(req.user);

      document.status = "Verified";

      document.verification = {
        status: "Verified",
        verifiedBy: userName,
        verifiedByUserId: userId,
        verifiedAt,
        rejectionReason: "",
        notes: verificationNotes,
      };

      document.updatedBy = userName;

      appendHistory({
        document,
        action: "HR Verified",
        fromStatus:
          previousStatus,
        toStatus: "Verified",
        notes: verificationNotes,
        user: req.user,
      });

      await document.save();

      const afterValues =
        buildAuditSnapshot(document);

      await writeAuditLog({
        req,
        action:
          "VERIFY_EMPLOYMENT_DOCUMENT",
        module: "HR",
        description:
          `Controlled employment document ${document.documentNumber} verified by HR.`,
        targetType:
          "EmploymentDocument",
        targetId:
          document.documentNumber,
        beforeValues,
        afterValues,
        metadata: {
          employeeId:
            document.employeeId,
          checksumSha256:
            activeVersion.file
              .checksumSha256,
        },
      });

      return res.json({
        success: true,
        message:
          `${document.documentNumber} verified successfully.`,
        data:
          serializeControlledDocument(
            document
          ),
      });
    } catch (error) {
      console.error(
        "Verify controlled employment document error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Failed to verify controlled employment document.",
      });
    }
  };

const rejectControlledDocument =
  async (req, res) => {
    try {
      const document =
        await findControlledDocument(
          req.params.documentNumber
        );

      if (
        !ensureDocumentExists(
          document,
          res
        ) ||
        !ensureNotArchived(
          document,
          res
        )
      ) {
        return;
      }

      if (
        document.status !==
        "Pending Verification"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} must have Pending Verification status before rejection.`,
          data: {
            documentNumber:
              document.documentNumber,
            currentStatus:
              document.status,
            requiredStatus:
              "Pending Verification",
          },
        });
      }

      const rejectionReason =
        String(
          req.body
            .rejectionReason || ""
        ).trim();

      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          message:
            "A document rejection reason is required.",
        });
      }

      const reviewNotes =
        String(
          req.body.reviewNotes || ""
        ).trim();

      const beforeValues =
        buildAuditSnapshot(document);

      const previousStatus =
        document.status;
      const userName =
        getUserName(req.user);
      const userId =
        getUserId(req.user);

      document.status = "Rejected";

      document.verification = {
        status: "Rejected",
        verifiedBy: userName,
        verifiedByUserId: userId,
        verifiedAt: new Date(),
        rejectionReason,
        notes: reviewNotes,
      };

      document.updatedBy = userName;

      appendHistory({
        document,
        action: "HR Rejected",
        fromStatus:
          previousStatus,
        toStatus: "Rejected",
        notes:
          reviewNotes
            ? `${rejectionReason} ${reviewNotes}`
            : rejectionReason,
        user: req.user,
      });

      await document.save();

      const afterValues =
        buildAuditSnapshot(document);

      await writeAuditLog({
        req,
        action:
          "REJECT_EMPLOYMENT_DOCUMENT",
        module: "HR",
        description:
          `Controlled employment document ${document.documentNumber} rejected by HR.`,
        targetType:
          "EmploymentDocument",
        targetId:
          document.documentNumber,
        beforeValues,
        afterValues,
        metadata: {
          employeeId:
            document.employeeId,
          rejectionReason,
        },
      });

      return res.json({
        success: true,
        message:
          `${document.documentNumber} rejected successfully.`,
        data:
          serializeControlledDocument(
            document
          ),
      });
    } catch (error) {
      console.error(
        "Reject controlled employment document error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Failed to reject controlled employment document.",
      });
    }
  };

module.exports = {
  updateControlledDocumentMetadata,
  verifyControlledDocument,
  rejectControlledDocument,
};