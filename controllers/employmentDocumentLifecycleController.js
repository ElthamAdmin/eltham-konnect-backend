const mongoose = require("mongoose");

const EmploymentDocument = require(
  "../models/EmploymentDocument"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

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

const serializeLifecycleDocument = (
  document
) => ({
  documentNumber:
    document.documentNumber,
  employeeId:
    document.employeeId,
  employeeSnapshot:
    document.employeeSnapshot || {},
  documentName:
    document.documentName,
  documentType:
    document.documentType,
  description:
    document.description || "",
  status:
    document.status,
  verification:
    document.verification || {},
  acknowledgement:
    document.acknowledgement || {},
  currentVersionNumber:
    document.currentVersionNumber,
  supersedesDocumentNumber:
    document
      .supersedesDocumentNumber ||
    "",
  supersededByDocumentNumber:
    document
      .supersededByDocumentNumber ||
    "",
  archived:
    Boolean(document.archived),
  archivedBy:
    document.archivedBy || "",
  archivedAt:
    document.archivedAt || null,
  archiveReason:
    document.archiveReason || "",
  updatedBy:
    document.updatedBy || "",
  history:
    document.history || [],
  createdAt:
    document.createdAt,
  updatedAt:
    document.updatedAt,
});

const buildLifecycleAuditSnapshot = (
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
  status:
    document.status,
  currentVersionNumber:
    document.currentVersionNumber,
  supersedesDocumentNumber:
    document
      .supersedesDocumentNumber ||
    "",
  supersededByDocumentNumber:
    document
      .supersededByDocumentNumber ||
    "",
  archived:
    Boolean(document.archived),
  archivedBy:
    document.archivedBy || "",
  archivedAt:
    document.archivedAt || null,
  archiveReason:
    document.archiveReason || "",
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

const archiveControlledDocument =
  async (req, res) => {
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
          "Archived"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} is already archived.`,
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
        document.status ===
        "Cancelled"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} cannot be archived because it is cancelled.`,
        });
      }

      const archiveReason =
        String(
          req.body.archiveReason ||
            ""
        ).trim();

      if (!archiveReason) {
        return res.status(400).json({
          success: false,
          message:
            "A document archive reason is required.",
        });
      }

      const beforeValues =
        buildLifecycleAuditSnapshot(
          document
        );

      const previousStatus =
        document.status;
      const archivedAt =
        new Date();
      const userName =
        getUserName(req.user);

      document.status = "Archived";
      document.archived = true;
      document.archivedBy =
        userName;
      document.archivedAt =
        archivedAt;
      document.archiveReason =
        archiveReason;
      document.updatedBy =
        userName;

      appendHistory({
        document,
        action: "Archived",
        fromStatus:
          previousStatus,
        toStatus: "Archived",
        notes: archiveReason,
        user: req.user,
      });

      await document.save();

      const afterValues =
        buildLifecycleAuditSnapshot(
          document
        );

      await writeAuditLog({
        req,
        action:
          "ARCHIVE_EMPLOYMENT_DOCUMENT",
        module: "HR",
        description:
          `Controlled employment document ${document.documentNumber} archived.`,
        targetType:
          "EmploymentDocument",
        targetId:
          document.documentNumber,
        beforeValues,
        afterValues,
        metadata: {
          employeeId:
            document.employeeId,
          archiveReason,
        },
      });

      return res.json({
        success: true,
        message:
          `${document.documentNumber} archived successfully.`,
        data:
          serializeLifecycleDocument(
            document
          ),
      });
    } catch (error) {
      console.error(
        "Archive controlled employment document error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Failed to archive controlled employment document.",
      });
    }
  };

const supersedeControlledDocument =
  async (req, res) => {
    const session =
      await mongoose.startSession();

    try {
      const documentNumber =
        normalizeDocumentNumber(
          req.params.documentNumber
        );

      const replacementDocumentNumber =
        normalizeDocumentNumber(
          req.body
            .replacementDocumentNumber
        );

      const supersedeReason =
        String(
          req.body
            .supersedeReason || ""
        ).trim();

      if (
        !replacementDocumentNumber
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A replacement document number is required.",
        });
      }

      if (
        replacementDocumentNumber ===
        documentNumber
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A document cannot supersede itself.",
        });
      }

      if (!supersedeReason) {
        return res.status(400).json({
          success: false,
          message:
            "A document superseding reason is required.",
        });
      }

      let originalDocument;
      let replacementDocument;
      let originalBefore;
      let replacementBefore;

      await session.withTransaction(
        async () => {
          originalDocument =
            await EmploymentDocument.findOne(
              {
                documentNumber,
              }
            ).session(session);

          replacementDocument =
            await EmploymentDocument.findOne(
              {
                documentNumber:
                  replacementDocumentNumber,
              }
            ).session(session);

          if (!originalDocument) {
            const error =
              new Error(
                "The original controlled employment document was not found."
              );

            error.statusCode = 404;
            throw error;
          }

          if (
            !replacementDocument
          ) {
            const error =
              new Error(
                "The replacement controlled employment document was not found."
              );

            error.statusCode = 404;
            throw error;
          }

          if (
            originalDocument
              .employeeId !==
            replacementDocument
              .employeeId
          ) {
            const error =
              new Error(
                "The original and replacement documents must belong to the same employee."
              );

            error.statusCode = 409;
            throw error;
          }

          if (
            originalDocument.archived ||
            replacementDocument.archived
          ) {
            const error =
              new Error(
                "Archived documents cannot participate in a superseding transaction."
              );

            error.statusCode = 409;
            throw error;
          }

          if (
            originalDocument.status !==
            "Verified"
          ) {
            const error =
              new Error(
                `${originalDocument.documentNumber} must have Verified status before it can be superseded.`
              );

            error.statusCode = 409;
            throw error;
          }

          if (
            replacementDocument.status !==
            "Verified"
          ) {
            const error =
              new Error(
                `${replacementDocument.documentNumber} must have Verified status before it can replace another document.`
              );

            error.statusCode = 409;
            throw error;
          }

          if (
            originalDocument
              .supersededByDocumentNumber
          ) {
            const error =
              new Error(
                `${originalDocument.documentNumber} has already been superseded.`
              );

            error.statusCode = 409;
            throw error;
          }

          if (
            replacementDocument
              .supersedesDocumentNumber &&
            replacementDocument
              .supersedesDocumentNumber !==
              originalDocument
                .documentNumber
          ) {
            const error =
              new Error(
                `${replacementDocument.documentNumber} already supersedes another document.`
              );

            error.statusCode = 409;
            throw error;
          }

          originalBefore =
            buildLifecycleAuditSnapshot(
              originalDocument
            );

          replacementBefore =
            buildLifecycleAuditSnapshot(
              replacementDocument
            );

          const userName =
            getUserName(req.user);

          originalDocument.status =
            "Superseded";

          originalDocument
            .supersededByDocumentNumber =
            replacementDocument
              .documentNumber;

          originalDocument.updatedBy =
            userName;

          replacementDocument
            .supersedesDocumentNumber =
            originalDocument
              .documentNumber;

          replacementDocument.updatedBy =
            userName;

          appendHistory({
            document:
              originalDocument,
            action: "Superseded",
            fromStatus: "Verified",
            toStatus: "Superseded",
            notes:
              `${supersedeReason} Replacement: ${replacementDocument.documentNumber}.`,
            user: req.user,
          });

          appendHistory({
            document:
              replacementDocument,
            action:
              "Became Replacement",
            fromStatus: "Verified",
            toStatus: "Verified",
            notes:
              `${supersedeReason} Supersedes: ${originalDocument.documentNumber}.`,
            user: req.user,
          });

          await originalDocument.save({
            session,
          });

          await replacementDocument.save({
            session,
          });
        }
      );

      const originalAfter =
        buildLifecycleAuditSnapshot(
          originalDocument
        );

      const replacementAfter =
        buildLifecycleAuditSnapshot(
          replacementDocument
        );

      await writeAuditLog({
        req,
        action:
          "SUPERSEDE_EMPLOYMENT_DOCUMENT",
        module: "HR",
        description:
          `Controlled employment document ${originalDocument.documentNumber} superseded by ${replacementDocument.documentNumber}.`,
        targetType:
          "EmploymentDocument",
        targetId:
          originalDocument
            .documentNumber,
        beforeValues: {
          original:
            originalBefore,
          replacement:
            replacementBefore,
        },
        afterValues: {
          original:
            originalAfter,
          replacement:
            replacementAfter,
        },
        metadata: {
          employeeId:
            originalDocument
              .employeeId,
          replacementDocumentNumber:
            replacementDocument
              .documentNumber,
          supersedeReason,
        },
      });

      return res.json({
        success: true,
        message:
          `${originalDocument.documentNumber} superseded successfully by ${replacementDocument.documentNumber}.`,
        data: {
          original:
            serializeLifecycleDocument(
              originalDocument
            ),
          replacement:
            serializeLifecycleDocument(
              replacementDocument
            ),
        },
      });
    } catch (error) {
      console.error(
        "Supersede controlled employment document error:",
        error
      );

      return res
        .status(
          error.statusCode || 400
        )
        .json({
          success: false,
          message:
            error.message ||
            "Failed to supersede controlled employment document.",
        });
    } finally {
      await session.endSession();
    }
  };

module.exports = {
  archiveControlledDocument,
  supersedeControlledDocument,
};