const EmployeeRelationsCase = require(
  "../models/EmployeeRelationsCase"
);

const {
  writeAuditLog,
} = require(
  "../utils/auditLogger"
);

const {
  uploadEmployeeRelationsEvidenceBuffer,
  generateSignedEvidenceUrl,
  destroyEmployeeRelationsEvidenceAsset,
} = require(
  "../services/employeeRelationsEvidenceStorageService"
);

const TERMINAL_CASE_STATUSES = [
  "Closed",
  "Withdrawn",
  "Cancelled",
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
      user?.email ||
      "System"
  );

const isHrUser = (user) => {
  if (user?.role === "Admin") {
    return true;
  }

  return Array.isArray(
    user?.permissions
  )
    ? user.permissions.includes(
        "hr"
      )
    : false;
};

const canAccessCase = (
  record,
  user
) => {
  if (isHrUser(user)) {
    return true;
  }

  const userId =
    getUserId(user);

  const linkedEmployeeId =
    normalizeString(
      user?.linkedEmployeeId
    );

  return Boolean(
    (
      userId &&
      [
        record
          .subjectLinkedUserId,
        record
          .complainantLinkedUserId,
      ].includes(userId)
    ) ||
    (
      linkedEmployeeId &&
      [
        record
          .subjectEmployeeId,
        record
          .complainantEmployeeId,
      ].includes(
        linkedEmployeeId
      )
    )
  );
};

const createEvidenceNumber = () => {
  const random = Math.floor(
    1000 +
      Math.random() *
        9000
  );

  return `EREV-${Date.now()}-${random}`;
};

const getCaseWithStorageFields =
  (caseNumber) =>
    EmployeeRelationsCase
      .findOne({
        caseNumber,
      })
      .select(
        [
          "+evidence.file.cloudinaryPublicId",
          "+evidence.file.cloudinaryResourceType",
          "+evidence.file.cloudinaryDeliveryType",
          "+evidence.file.cloudinaryFormat",
        ].join(" ")
      );

const findEvidence = (
  record,
  evidenceNumber
) =>
  (record.evidence || [])
    .find(
      (item) =>
        normalizeString(
          item.evidenceNumber
        ).toUpperCase() ===
        evidenceNumber
    );

const serializeEvidence = (
  evidence
) => {
  const data =
    evidence?.toObject
      ? evidence.toObject()
      : { ...evidence };

  if (data?.file) {
    delete data.file
      .cloudinaryPublicId;

    delete data.file
      .cloudinaryResourceType;

    delete data.file
      .cloudinaryDeliveryType;

    delete data.file
      .cloudinaryFormat;
  }

  return data;
};

const sendControllerError = (
  res,
  error,
  fallbackMessage
) => {
  if (
    error?.name ===
    "ValidationError"
  ) {
    return res
      .status(400)
      .json({
        success: false,
        message:
          error.message,
      });
  }

  console.error(
    fallbackMessage,
    error
  );

  return res
    .status(500)
    .json({
      success: false,
      message:
        fallbackMessage,
      error:
        error.message,
    });
};

const uploadCaseEvidence =
  async (req, res) => {
    let storedFile = null;

    try {
      const caseNumber =
        normalizeString(
          req.params.caseNumber
        ).toUpperCase();

      const evidenceType =
        normalizeString(
          req.body.evidenceType
        );

      const title =
        normalizeString(
          req.body.title
        );

      const description =
        normalizeString(
          req.body.description
        );

      if (!req.file) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "An employee-relations evidence file is required.",
          });
      }

      if (
        !evidenceType ||
        !EVIDENCE_TYPES.includes(
          evidenceType
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "A valid employee-relations evidence type is required.",
          });
      }

      if (!title) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "An evidence title is required.",
          });
      }

      const record =
        await getCaseWithStorageFields(
          caseNumber
        );

      if (!record) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Controlled employee-relations case not found.",
          });
      }

      if (
        !canAccessCase(
          record,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "You are not authorized to submit evidence to this restricted case.",
          });
      }

      if (
        TERMINAL_CASE_STATUSES
          .includes(
            record.status
          )
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `Evidence cannot be submitted while case ${record.caseNumber} is ${record.status}.`,
          });
      }

      if (
        !isHrUser(req.user) &&
        record.status ===
          "Draft"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "Employees cannot submit evidence to a draft case.",
          });
      }

      const actorName =
        getUserName(
          req.user
        );

      const actorUserId =
        getUserId(
          req.user
        );

      const evidenceNumber =
        createEvidenceNumber();

      storedFile =
        await uploadEmployeeRelationsEvidenceBuffer(
          {
            buffer:
              req.file.buffer,

            caseNumber:
              record.caseNumber,

            evidenceNumber,

            originalFileName:
              req.file
                .originalname,

            mimeType:
              req.file.mimetype,
          }
        );

      const confidential =
        isHrUser(req.user)
          ? req.body
              .confidential ===
              true ||
            normalizeString(
              req.body
                .confidential
            ).toLowerCase() ===
              "true"
          : false;

      record.evidence.push({
        evidenceNumber,
        evidenceType,
        title,
        description,
        status:
          "Submitted",
        confidential,

        file: {
          originalFileName:
            storedFile
              .originalFileName,

          mimeType:
            storedFile
              .mimeType,

          sizeBytes:
            storedFile
              .sizeBytes,

          checksumSha256:
            storedFile
              .checksumSha256,

          storageProvider:
            storedFile
              .storageProvider,

          cloudinaryPublicId:
            storedFile
              .cloudinaryPublicId,

          cloudinaryResourceType:
            storedFile
              .cloudinaryResourceType,

          cloudinaryDeliveryType:
            storedFile
              .cloudinaryDeliveryType,

          cloudinaryFormat:
            storedFile
              .cloudinaryFormat,
        },

        submittedBy:
          actorName,

        submittedByUserId:
          actorUserId,

        submittedAt:
          new Date(),
      });

      record.updatedBy =
        actorName;

      record.history.push({
        action:
          "Evidence Submitted",

        fromStatus:
          record.status,

        toStatus:
          record.status,

        notes:
          `${evidenceNumber}: ${title}`,

        performedBy:
          actorName,

        performedByUserId:
          actorUserId,
      });

      await record.save();

      const createdEvidence =
        findEvidence(
          record,
          evidenceNumber
        );

      await writeAuditLog({
        req,
        action:
          "Employee Relations Evidence Submitted",
        module: "HR",
        description:
          `Evidence ${evidenceNumber} was submitted to restricted case ${record.caseNumber}.`,
        targetType:
          "EmployeeRelationsEvidence",
        targetId:
          evidenceNumber,
        metadata: {
          caseNumber:
            record.caseNumber,
          caseType:
            record.caseType,
          evidenceType,
          confidential,
          fileSizeBytes:
            storedFile
              .sizeBytes,
          checksumSha256:
            storedFile
              .checksumSha256,
        },
      });

      return res
        .status(201)
        .json({
          success: true,
          message:
            "Controlled employee-relations evidence uploaded successfully.",
          data: {
            caseNumber:
              record.caseNumber,
            evidence:
              serializeEvidence(
                createdEvidence
              ),
          },
        });
    } catch (error) {
      if (
        storedFile
          ?.cloudinaryPublicId
      ) {
        try {
          await destroyEmployeeRelationsEvidenceAsset(
            {
              cloudinaryPublicId:
                storedFile
                  .cloudinaryPublicId,

              cloudinaryResourceType:
                storedFile
                  .cloudinaryResourceType,

              cloudinaryDeliveryType:
                storedFile
                  .cloudinaryDeliveryType,
            }
          );
        } catch (
          cleanupError
        ) {
          console.error(
            "Employee-relations evidence cleanup failed:",
            cleanupError.message
          );
        }
      }

      return sendControllerError(
        res,
        error,
        "Failed to upload the controlled employee-relations evidence."
      );
    }
  };

const downloadCaseEvidence =
  async (req, res) => {
    try {
      const caseNumber =
        normalizeString(
          req.params.caseNumber
        ).toUpperCase();

      const evidenceNumber =
        normalizeString(
          req.params
            .evidenceNumber
        ).toUpperCase();

      const record =
        await getCaseWithStorageFields(
          caseNumber
        );

      if (!record) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Controlled employee-relations case not found.",
          });
      }

      if (
        !canAccessCase(
          record,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "You are not authorized to access evidence for this restricted case.",
          });
      }

      const evidence =
        findEvidence(
          record,
          evidenceNumber
        );

      if (!evidence) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Controlled employee-relations evidence not found.",
          });
      }

      if (
        evidence.confidential &&
        !isHrUser(req.user)
      ) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "This evidence is restricted to authorized HR personnel.",
          });
      }

      if (
        evidence.status ===
        "Withdrawn"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "Withdrawn evidence cannot be downloaded.",
          });
      }

      if (
        !evidence.file
          ?.cloudinaryPublicId
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "The evidence file does not have controlled Cloudinary storage metadata.",
          });
      }

      const expiresInSeconds =
        300;

      const downloadUrl =
        generateSignedEvidenceUrl(
          {
            cloudinaryPublicId:
              evidence.file
                .cloudinaryPublicId,

            cloudinaryResourceType:
              evidence.file
                .cloudinaryResourceType ||
              "raw",

            cloudinaryDeliveryType:
              evidence.file
                .cloudinaryDeliveryType ||
              "authenticated",

            cloudinaryFormat:
              evidence.file
                .cloudinaryFormat ||
              "",

            expiresInSeconds,

            attachment:
              true,
          }
        );

      await writeAuditLog({
        req,
        action:
          "Employee Relations Evidence Download Authorized",
        module: "HR",
        description:
          `A five-minute signed download URL was issued for evidence ${evidence.evidenceNumber} in case ${record.caseNumber}.`,
        targetType:
          "EmployeeRelationsEvidence",
        targetId:
          evidence.evidenceNumber,
        metadata: {
          caseNumber:
            record.caseNumber,
          caseType:
            record.caseType,
          confidential:
            evidence.confidential,
          employeeAccess:
            !isHrUser(
              req.user
            ),
          expiresInSeconds,
        },
      });

      return res.json({
        success: true,
        message:
          "Secure employee-relations evidence download authorized successfully.",
        data: {
          caseNumber:
            record.caseNumber,

          evidenceNumber:
            evidence
              .evidenceNumber,

          originalFileName:
            evidence.file
              .originalFileName,

          mimeType:
            evidence.file
              .mimeType,

          sizeBytes:
            evidence.file
              .sizeBytes,

          checksumSha256:
            evidence.file
              .checksumSha256,

          downloadUrl,

          expiresInSeconds,
        },
      });
    } catch (error) {
      return sendControllerError(
        res,
        error,
        "Failed to authorize the secure employee-relations evidence download."
      );
    }
  };

const reviewCaseEvidence =
  async (req, res) => {
    try {
      const caseNumber =
        normalizeString(
          req.params.caseNumber
        ).toUpperCase();

      const evidenceNumber =
        normalizeString(
          req.params
            .evidenceNumber
        ).toUpperCase();

      const decision =
        normalizeString(
          req.body.decision
        );

      const reviewNotes =
        normalizeString(
          req.body.reviewNotes
        );

      if (
        ![
          "Accepted",
          "Rejected",
        ].includes(
          decision
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "The evidence review decision must be Accepted or Rejected.",
          });
      }

      if (
        decision ===
          "Rejected" &&
        !reviewNotes
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Evidence rejection requires review notes.",
          });
      }

      const record =
        await getCaseWithStorageFields(
          caseNumber
        );

      if (!record) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Controlled employee-relations case not found.",
          });
      }

      const evidence =
        findEvidence(
          record,
          evidenceNumber
        );

      if (!evidence) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Controlled employee-relations evidence not found.",
          });
      }

      if (
        evidence.status !==
        "Submitted"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `${evidence.evidenceNumber} has already been ${evidence.status.toLowerCase()}.`,
            data: {
              evidenceNumber:
                evidence
                  .evidenceNumber,
              currentStatus:
                evidence.status,
            },
          });
      }

      const actorName =
        getUserName(
          req.user
        );

      const actorUserId =
        getUserId(
          req.user
        );

      const previousStatus =
        evidence.status;

      evidence.status =
        decision;

      evidence.reviewedBy =
        actorName;

      evidence.reviewedByUserId =
        actorUserId;

      evidence.reviewedAt =
        new Date();

      evidence.reviewNotes =
        reviewNotes;

      record.updatedBy =
        actorName;

      record.history.push({
        action:
          "Evidence Reviewed",

        fromStatus:
          record.status,

        toStatus:
          record.status,

        notes:
          `${evidence.evidenceNumber} was ${decision.toLowerCase()}. ${
            reviewNotes ||
            "No additional review notes were recorded."
          }`,

        performedBy:
          actorName,

        performedByUserId:
          actorUserId,
      });

      await record.save();

      await writeAuditLog({
        req,
        action:
          "Employee Relations Evidence Reviewed",
        module: "HR",
        description:
          `Evidence ${evidence.evidenceNumber} in case ${record.caseNumber} was ${decision.toLowerCase()}.`,
        targetType:
          "EmployeeRelationsEvidence",
        targetId:
          evidence.evidenceNumber,
        metadata: {
          caseNumber:
            record.caseNumber,
          caseType:
            record.caseType,
        },
        beforeValues: {
          status:
            previousStatus,
        },
        afterValues: {
          status:
            evidence.status,
          reviewedBy:
            evidence.reviewedBy,
          reviewedAt:
            evidence.reviewedAt,
          reviewNotes:
            evidence.reviewNotes,
        },
      });

      return res.json({
        success: true,
        message:
          `${evidence.evidenceNumber} ${decision.toLowerCase()} successfully.`,
        data: {
          caseNumber:
            record.caseNumber,
          evidence:
            serializeEvidence(
              evidence
            ),
        },
      });
    } catch (error) {
      return sendControllerError(
        res,
        error,
        "Failed to review the controlled employee-relations evidence."
      );
    }
  };

module.exports = {
  uploadCaseEvidence,
  downloadCaseEvidence,
  reviewCaseEvidence,
};