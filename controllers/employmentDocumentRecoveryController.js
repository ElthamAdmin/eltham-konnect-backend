const EmploymentDocument = require(
  "../models/EmploymentDocument"
);

const HREmployee = require(
  "../models/HREmployee"
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

const normalizeString = (value) =>
  String(value || "").trim();

const getUserId = (user) =>
  normalizeString(
    user?.userId ||
      user?._id ||
      user?.id
  );

const getUserName = (user) =>
  normalizeString(
    user?.fullName ||
      user?.name ||
      user?.email
  ) || "System User";

const getConfidentiality = (
  documentType
) => {
  if (
    [
      "Warning Letter",
      "Medical",
      "Background Check",
    ].includes(documentType)
  ) {
    return {
      confidentialityLevel:
        "Highly Restricted",

      employeeCanDownload:
        false,
    };
  }

  if (
    [
      "TRN",
      "NIS",
      "Tax",
    ].includes(documentType)
  ) {
    return {
      confidentialityLevel:
        "HR Restricted",

      employeeCanDownload:
        false,
    };
  }

  return {
    confidentialityLevel:
      "Employee Visible",

    employeeCanDownload:
      true,
  };
};

const serializeRecoveredDocument = (
  document
) => {
  const value =
    document.toObject();

  /*
   * Cloudinary storage keys and
   * permanent URLs are excluded.
   */
  value.versions = (
    value.versions || []
  ).map((version) => ({
    _id: version._id,

    versionNumber:
      version.versionNumber,

    changeReason:
      version.changeReason,

    uploadedBy:
      version.uploadedBy,

    uploadedAt:
      version.uploadedAt,

    active:
      version.active,

    file: {
      originalFileName:
        version.file
          ?.originalFileName ||
        "",

      mimeType:
        version.file
          ?.mimeType || "",

      sizeBytes:
        version.file
          ?.sizeBytes || 0,

      checksumSha256:
        version.file
          ?.checksumSha256 ||
        "",

      storageProvider:
        version.file
          ?.storageProvider ||
        "",
    },
  }));

  return value;
};

const recoverLegacyEmploymentDocument =
  async (req, res) => {
    let storedFile = null;

    try {
      const employeeId =
        normalizeString(
          req.params.employeeId
        );

      const legacyDocumentId =
        normalizeString(
          req.params
            .legacyDocumentId
        );

      if (
        !employeeId ||
        !legacyDocumentId
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Employee ID and legacy document ID are required.",
          });
      }

      if (!req.file?.buffer) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "The original legacy document file is required.",
          });
      }

      const employee =
        await HREmployee.findOne({
          employeeId,
        });

      if (!employee) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Employee was not found.",
          });
      }

      const legacyDocument =
        employee.documents.id(
          legacyDocumentId
        );

      if (!legacyDocument) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "The legacy employee document record was not found.",
          });
      }

      const legacyFileUrl =
        normalizeString(
          legacyDocument.fileUrl
        );

      /*
       * Recovery is idempotent. Either
       * the legacy subdocument ID or its
       * original URL can identify an
       * existing controlled record.
       */
      const existingDocument =
        await EmploymentDocument.findOne(
          {
            $or: [
              {
                employeeId,

                "legacyReference.employeeDocumentId":
                  legacyDocumentId,
              },

              ...(legacyFileUrl
                ? [
                    {
                      employeeId,

                      "legacyReference.legacyFileUrl":
                        legacyFileUrl,
                    },
                  ]
                : []),
            ],
          }
        );

      if (existingDocument) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              `${legacyDocument.documentName || "Legacy document"} has already been recovered as ${existingDocument.documentNumber}.`,

            data: {
              documentNumber:
                existingDocument
                  .documentNumber,

              status:
                existingDocument
                  .status,
            },
          });
      }

      storedFile =
        await uploadEmploymentDocumentBuffer(
          {
            buffer:
              req.file.buffer,

            employeeId,

            originalFileName:
              req.file
                .originalname,

            mimeType:
              req.file.mimetype,
          }
        );

      const documentType =
        normalizeString(
          legacyDocument.documentType
        ) || "Other";

      const confidentiality =
        getConfidentiality(
          documentType
        );

      const userName =
        getUserName(req.user);

      const userId =
        getUserId(req.user);

      const recoveredAt =
        new Date();

      const legacyArrayIndex =
        employee.documents.findIndex(
          (document) =>
            String(
              document._id
            ) ===
            legacyDocumentId
        );

      /*
       * Signed evidence is recognized
       * from either the controlled name
       * or the supplied original file
       * name. HR verification remains
       * required.
       */
      const signedLegacyEvidence =
        /signed/i.test(
          `${
            legacyDocument.documentName ||
            ""
          } ${
            req.file.originalname ||
            ""
          }`
        );

      const acknowledgementRequired =
        [
          "Contract",
          "Job Letter",
          "Warning Letter",
          "Policy",
          "Handbook",
        ].includes(documentType);

      const documentNumber =
        `EDOC-LEGACY-${employeeId}-${legacyDocumentId}`.toUpperCase();

      const document =
        new EmploymentDocument({
          documentNumber,
          employeeId,

          linkedUserId:
            employee.linkedUserId ||
            "",

          employeeSnapshot: {
            fullName:
              employee.fullName,

            jobTitle:
              employee.jobTitle ||
              "",

            department:
              employee.department ||
              "",

            branch:
              employee.branch ||
              "",

            employmentStatus:
              employee.employmentStatus ||
              "",
          },

          documentName:
            legacyDocument.documentName ||
            req.file.originalname,

          documentType,

          description:
            normalizeString(
              req.body.description
            ) ||
            "Recovered from the legacy embedded employee-document record after the original Render local file became unavailable.",

          confidentialityLevel:
            confidentiality
              .confidentialityLevel,

          employeeCanDownload:
            confidentiality
              .employeeCanDownload,

          expiryTrackingRequired:
            false,

          acknowledgementRequired,

          acknowledgement:
            acknowledgementRequired
              ? signedLegacyEvidence
                ? {
                    status:
                      "Acknowledged",

                    acknowledgedBy:
                      employee.fullName,

                    acknowledgedByUserId:
                      employee.linkedUserId ||
                      "",

                    acknowledgedAt:
                      legacyDocument.uploadedAt ||
                      recoveredAt,

                    comments:
                      "Acknowledgement preserved from the recovered signed legacy document. HR verification remains required.",
                  }
                : {
                    status:
                      "Pending",
                  }
              : {
                  status:
                    "Not Required",
                },

          status:
            "Pending Verification",

          verification: {
            status: "Pending",
          },

          currentVersionNumber:
            1,

          versions: [
            {
              versionNumber: 1,

              file:
                storedFile,

              changeReason:
                "Original signed legacy document recovered into controlled Cloudinary storage.",

              uploadedBy:
                userName,

              uploadedByUserId:
                userId,

              uploadedAt:
                recoveredAt,

              active: true,
            },
          ],

          sourceType:
            "Legacy Employee Record",

          sourceReference:
            legacyDocumentId,

          legacyReference: {
            employeeDocumentId:
              legacyDocumentId,

            legacyArrayIndex,

            legacyFileUrl,

            migratedAt:
              recoveredAt,
          },

          createdBy:
            userName,

          createdByUserId:
            userId,

          updatedBy:
            userName,

          history: [
            {
              action:
                "Legacy Recovered",

              fromStatus:
                "Legacy Record",

              toStatus:
                "Pending Verification",

              performedBy:
                userName,

              performedByUserId:
                userId,

              performedAt:
                recoveredAt,

              notes:
                "The original signed file was supplied by HR and recovered into authenticated Cloudinary storage. The embedded legacy record was preserved.",
            },
          ],
        });

      await document.save();

      try {
        await writeAuditLog({
          req,

          action:
            "RECOVER_LEGACY_EMPLOYMENT_DOCUMENT",

          module: "HR",

          description:
            `Legacy document ${legacyDocumentId} recovered as ${document.documentNumber}.`,

          targetType:
            "EmploymentDocument",

          targetId:
            document.documentNumber,

          afterValues:
            serializeRecoveredDocument(
              document
            ),

          metadata: {
            employeeId,
            legacyDocumentId,
            legacyFileUrl,
            documentType,
            signedLegacyEvidence,

            checksumSha256:
              storedFile
                .checksumSha256,
          },
        });
      } catch (auditError) {
        console.error(
          "Legacy document recovery audit error:",
          auditError
        );
      }

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Legacy employment document recovered successfully. HR verification is required.",

          data:
            serializeRecoveredDocument(
              document
            ),
        });
    } catch (error) {
      /*
       * If Cloudinary succeeded but the
       * database record failed, remove
       * only that newly uploaded and
       * uncommitted asset.
       */
      if (
        storedFile?.storageKey
      ) {
        try {
          await destroyEmploymentDocumentAsset(
            {
              storageKey:
                storedFile
                  .storageKey,

              resourceType:
                storedFile
                  .resourceType,

              deliveryType:
                storedFile
                  .deliveryType,
            }
          );
        } catch (cleanupError) {
          console.error(
            "Legacy recovery cleanup error:",
            cleanupError
          );
        }
      }

      console.error(
        "Legacy document recovery error:",
        error
      );

      return res
        .status(
          error.statusCode ||
            400
        )
        .json({
          success: false,

          message:
            error.message ||
            "Could not recover the legacy employment document.",

          ...(error.data
            ? {
                data:
                  error.data,
              }
            : {}),
        });
    }
  };

module.exports = {
  recoverLegacyEmploymentDocument,
};