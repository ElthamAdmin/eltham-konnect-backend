const fs = require("fs");
const path = require("path");

const HREmployee = require(
  "../models/HREmployee"
);

const EmploymentDocument = require(
  "../models/EmploymentDocument"
);

const normalizeString = (value) =>
  String(value || "").trim();

const getLegacyFileAssessment = (
  fileUrl
) => {
  const normalizedFileUrl =
    normalizeString(fileUrl);

  if (!normalizedFileUrl) {
    return {
      sourceStorage: "Unknown",
      fileExists: false,
      localFilePath: "",

      migrationStatus:
        "Requires Review",

      issue:
        "The legacy document has no file URL.",
    };
  }

  if (
    normalizedFileUrl.includes(
      "res.cloudinary.com"
    )
  ) {
    return {
      sourceStorage:
        "Cloudinary URL",

      fileExists: null,
      localFilePath: "",

      migrationStatus:
        "Requires Review",

      issue:
        "The legacy Cloudinary URL must be resolved to a storage key and authenticated-delivery evidence before migration.",
    };
  }

  if (
    /^https?:\/\//i.test(
      normalizedFileUrl
    )
  ) {
    return {
      sourceStorage:
        "External URL",

      fileExists: null,
      localFilePath: "",

      migrationStatus:
        "Requires Review",

      issue:
        "External document URLs require manual source verification before migration.",
    };
  }

  /*
   * path.basename prevents a legacy
   * record from escaping the controlled
   * legacy upload directory.
   */
  const filename =
    path.basename(
      normalizedFileUrl
    );

  const localFilePath =
    path.join(
      __dirname,
      "../uploads/hr-documents",
      filename
    );

  const fileExists =
    Boolean(filename) &&
    fs.existsSync(localFilePath);

  return {
    sourceStorage:
      "Legacy Local Storage",

    fileExists,
    localFilePath,

    migrationStatus:
      fileExists
        ? "Ready"
        : "Requires Review",

    issue:
      fileExists
        ? ""
        : "The legacy document record exists, but its local source file is unavailable.",
  };
};

const getConfidentialityProposal = (
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

const requiresAcknowledgement = (
  documentType
) =>
  [
    "Contract",
    "Job Letter",
    "Warning Letter",
    "Policy",
    "Handbook",
  ].includes(documentType);

const createProposedDocumentNumber =
  ({
    employeeId,
    documentId,
    index,
  }) => {
    const stableSuffix =
      normalizeString(
        documentId
      ) ||
      String(
        index + 1
      ).padStart(3, "0");

    return `EDOC-LEGACY-${normalizeString(
      employeeId
    ).toUpperCase()}-${stableSuffix.toUpperCase()}`;
  };

const previewLegacyEmploymentDocumentMigration =
  async (req, res) => {
    try {
      const employeeId =
        normalizeString(
          req.query.employeeId
        );

      const employeeFilter =
        employeeId
          ? {
              employeeId,
            }
          : {};

      const employees =
        await HREmployee.find(
          employeeFilter
        )
          .select(
            "employeeId fullName jobTitle department branch employmentStatus linkedUserId documents"
          )
          .sort({
            employeeId: 1,
          });

      if (
        employeeId &&
        employees.length === 0
      ) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Employee was not found.",
          });
      }

      const legacyReferences =
        [];

      for (
        const employee of
        employees
      ) {
        for (
          let index = 0;
          index <
          (
            employee.documents ||
            []
          ).length;
          index += 1
        ) {
          const document =
            employee.documents[
              index
            ];

          const fileUrl =
            normalizeString(
              document.fileUrl
            );

          legacyReferences.push({
            employee,
            document,
            index,
            fileUrl,
          });
        }
      }

      const fileUrls =
        Array.from(
          new Set(
            legacyReferences
              .map(
                (entry) =>
                  entry.fileUrl
              )
              .filter(Boolean)
          )
        );

      const existingDocuments =
        fileUrls.length > 0
          ? await EmploymentDocument.find(
              {
                "legacyReference.legacyFileUrl":
                  {
                    $in: fileUrls,
                  },
              }
            )
              .select(
                "documentNumber employeeId legacyReference.legacyFileUrl status"
              )
              .lean()
          : [];

      const existingByReference =
        new Map(
          existingDocuments.map(
            (document) => [
              document
                .legacyReference
                .legacyFileUrl,

              document,
            ]
          )
        );

      const data =
        legacyReferences.map(
          ({
            employee,
            document,
            index,
            fileUrl,
          }) => {
            const documentId =
              normalizeString(
                document._id
              );

            const documentType =
              normalizeString(
                document.documentType
              ) || "Other";

            const existing =
              existingByReference.get(
                fileUrl
              );

            const storageAssessment =
              getLegacyFileAssessment(
                fileUrl
              );

            const confidentiality =
              getConfidentialityProposal(
                documentType
              );

            const alreadyMigrated =
              Boolean(existing);

            return {
              employeeId:
                employee.employeeId,

              employeeName:
                employee.fullName,

              employmentStatus:
                employee.employmentStatus,

              linkedUserId:
                employee.linkedUserId ||
                "",

              legacyDocumentId:
                documentId,

              legacyArrayIndex:
                index,

              documentName:
                document.documentName ||
                "Unnamed Document",

              documentType,

              legacyFileUrl:
                fileUrl,

              uploadedAt:
                document.uploadedAt ||
                null,

              sourceStorage:
                storageAssessment
                  .sourceStorage,

              fileExists:
                storageAssessment
                  .fileExists,

              proposedDocumentNumber:
                existing
                  ?.documentNumber ||
                createProposedDocumentNumber(
                  {
                    employeeId:
                      employee.employeeId,

                    documentId,

                    index,
                  }
                ),

              proposedConfidentialityLevel:
                confidentiality
                  .confidentialityLevel,

              proposedEmployeeCanDownload:
                confidentiality
                  .employeeCanDownload,

              proposedAcknowledgementRequired:
                requiresAcknowledgement(
                  documentType
                ),

              proposedVerificationStatus:
                "Pending",

              migrationStatus:
                alreadyMigrated
                  ? "Already Migrated"
                  : storageAssessment
                      .migrationStatus,

              issue:
                alreadyMigrated
                  ? "A controlled document already exists for this legacy file reference."
                  : storageAssessment
                      .issue,

              existingDocumentNumber:
                existing
                  ?.documentNumber ||
                "",

              existingDocumentStatus:
                existing?.status ||
                "",
            };
          }
        );

      const summary = {
        employeeCount:
          employees.length,

        employeesWithDocuments:
          new Set(
            data.map(
              (entry) =>
                entry.employeeId
            )
          ).size,

        legacyDocumentCount:
          data.length,

        readyCount:
          data.filter(
            (entry) =>
              entry.migrationStatus ===
              "Ready"
          ).length,

        alreadyMigratedCount:
          data.filter(
            (entry) =>
              entry.migrationStatus ===
              "Already Migrated"
          ).length,

        requiresReviewCount:
          data.filter(
            (entry) =>
              entry.migrationStatus ===
              "Requires Review"
          ).length,

        recordsCreated: 0,
        filesUploaded: 0,
      };

      return res.json({
        success: true,

        message:
          "Legacy employment-document migration preview generated successfully. No documents or files were changed.",

        summary,
        data,
      });
    } catch (error) {
      console.error(
        "Legacy document migration preview error:",
        error
      );

      return res
        .status(400)
        .json({
          success: false,

          message:
            error.message ||
            "Could not preview the legacy employment-document migration.",
        });
    }
  };

module.exports = {
  previewLegacyEmploymentDocumentMigration,
};