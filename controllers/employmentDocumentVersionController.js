const EmploymentDocument = require(
  "../models/EmploymentDocument"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const {
  uploadEmploymentDocumentBuffer,
  destroyEmploymentDocumentAsset,
} = require(
  "../services/employmentDocumentStorageService"
);

const VERSIONABLE_STATUSES = [
  "Draft",
  "Pending Verification",
  "Verified",
  "Rejected",
  "Expired",
];

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const getUserId = (user) =>
  String(
    user?.userId ||
      user?._id ||
      user?.id ||
      ""
  ).trim();

const normalizeDocumentNumber = (
  value
) => String(value || "").trim().toUpperCase();

const serializeVersionResult = (
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
    employeeId:
      source.employeeId,
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
    employeeCanDownload:
      Boolean(
        source.employeeCanDownload
      ),

    issueDate:
      source.issueDate || "",
    effectiveDate:
      source.effectiveDate || "",
    expiryDate:
      source.expiryDate || "",
    expiryTrackingRequired:
      Boolean(
        source
          .expiryTrackingRequired
      ),

    acknowledgementRequired:
      Boolean(
        source
          .acknowledgementRequired
      ),
    acknowledgement:
      source.acknowledgement || {},

    status:
      source.status,
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
      active: Boolean(
        version.active
      ),
      file: {
        originalFileName:
          version.file
            ?.originalFileName ||
          "",
        mimeType:
          version.file
            ?.mimeType ||
          "",
        sizeBytes:
          Number(
            version.file
              ?.sizeBytes ||
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
        resourceType:
          version.file
            ?.resourceType ||
          "",
        deliveryType:
          version.file
            ?.deliveryType ||
          "",
        format:
          version.file?.format ||
          "",
      },
    })),

    sourceType:
      source.sourceType || "",
    sourceReference:
      source.sourceReference || "",
    archived:
      Boolean(source.archived),
    history:
      source.history || [],
    updatedBy:
      source.updatedBy || "",
    createdAt:
      source.createdAt,
    updatedAt:
      source.updatedAt,
  };
};

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

const getNextVersionNumber = (
  versions
) => {
  const highestVersion = (
    versions || []
  ).reduce(
    (highest, version) =>
      Math.max(
        highest,
        Number(
          version.versionNumber ||
            0
        )
      ),
    0
  );

  return highestVersion + 1;
};

const buildVersionAuditSummary = (
  document
) => ({
  documentNumber:
    document.documentNumber,
  employeeId:
    document.employeeId,
  status:
    document.status,
  currentVersionNumber:
    document.currentVersionNumber,
  acknowledgement:
    document.acknowledgement,
  verification:
    document.verification,
  versions: (
    document.versions || []
  ).map((version) => ({
    versionNumber:
      version.versionNumber,
    active: Boolean(
      version.active
    ),
    changeReason:
      version.changeReason || "",
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
  })),
});

const uploadControlledDocumentVersion =
  async (req, res) => {
    let storedFile = null;

    try {
      const documentNumber =
        normalizeDocumentNumber(
          req.params.documentNumber
        );

      const document =
        await EmploymentDocument.findOne({
          documentNumber,
        });

      if (!document) {
        return res.status(404).json({
          success: false,
          message:
            "Controlled employment document was not found.",
        });
      }

      if (
        document.archived ||
        document.status ===
          "Archived" ||
        document.status ===
          "Cancelled" ||
        document.status ===
          "Superseded"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} cannot receive a new version while its status is ${document.status}.`,
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
      }

      if (
        !VERSIONABLE_STATUSES.includes(
          document.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} cannot receive a new version while its status is ${document.status}.`,
          data: {
            documentNumber:
              document.documentNumber,
            currentStatus:
              document.status,
            allowedStatuses:
              VERSIONABLE_STATUSES,
          },
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            "A replacement document file is required.",
        });
      }

      const changeReason =
        String(
          req.body.changeReason ||
            ""
        ).trim();

      if (!changeReason) {
        return res.status(400).json({
          success: false,
          message:
            "A document version change reason is required.",
        });
      }

      const beforeValues =
        buildVersionAuditSummary(
          document
        );

      storedFile =
        await uploadEmploymentDocumentBuffer(
          {
            buffer:
              req.file.buffer,

            employeeId:
              document.employeeId,

            originalFileName:
              req.file
                .originalname,

            mimeType:
              req.file.mimetype,
          }
        );

      const previousStatus =
        document.status;

      const previousVersionNumber =
        Number(
          document
            .currentVersionNumber ||
            0
        );

      const nextVersionNumber =
        getNextVersionNumber(
          document.versions
        );

      document.versions =
        document.versions || [];

      document.versions.forEach(
        (version) => {
          version.active = false;
        }
      );

      document.versions.push({
        versionNumber:
          nextVersionNumber,
        changeReason,
        uploadedBy:
          getUserName(req.user),
        uploadedAt: new Date(),
        active: true,
        file: storedFile,
      });

      document.currentVersionNumber =
        nextVersionNumber;

      document.status =
        "Pending Verification";

      document.verification = {
        status: "Pending",
        verifiedBy: "",
        verifiedByUserId: "",
        verifiedAt: null,
        rejectionReason: "",
        notes: "",
      };

      if (
        document
          .acknowledgementRequired
      ) {
        document.acknowledgement = {
          status: "Pending",
          acknowledgedBy: "",
          acknowledgedByUserId: "",
          acknowledgedAt: null,
          comments:
            "A new document version requires fresh employee acknowledgement after HR verification.",
        };
      } else {
        document.acknowledgement = {
          status:
            "Not Required",
          acknowledgedBy: "",
          acknowledgedByUserId: "",
          acknowledgedAt: null,
          comments: "",
        };
      }

      document.updatedBy =
        getUserName(req.user);

      appendHistory({
        document,
        action:
          "New Version Uploaded",
        fromStatus:
          previousStatus,
        toStatus:
          "Pending Verification",
        notes:
          `Version ${nextVersionNumber} uploaded. ${changeReason}`,
        user: req.user,
      });

      await document.save();

      const afterValues =
        buildVersionAuditSummary(
          document
        );

      await writeAuditLog({
        req,
        action:
          "UPLOAD_EMPLOYMENT_DOCUMENT_VERSION",
        module: "HR",
        description:
          `Version ${nextVersionNumber} uploaded for controlled employment document ${document.documentNumber}.`,
        targetType:
          "EmploymentDocument",
        targetId:
          document.documentNumber,
        beforeValues,
        afterValues,
        metadata: {
          employeeId:
            document.employeeId,
          previousVersionNumber,
          newVersionNumber:
            nextVersionNumber,
          changeReason,
          checksumSha256:
            storedFile
              .checksumSha256 ||
            "",
        },
      });

      storedFile = null;

      return res.status(201).json({
        success: true,
        message:
          `Version ${nextVersionNumber} uploaded successfully. HR verification is required.`,
        data:
          serializeVersionResult(
            document
          ),
      });
    } catch (error) {
      if (storedFile) {
        try {
          await destroyEmploymentDocumentAsset(
            storedFile
          );
        } catch (
          cleanupError
        ) {
          console.error(
            "Uncommitted document-version cleanup error:",
            cleanupError
          );
        }
      }

      console.error(
        "Upload controlled employment document version error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Failed to upload controlled employment-document version.",
      });
    }
  };

module.exports = {
  uploadControlledDocumentVersion,
};