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
    user?._id ||
      user?.userId ||
      user?.id ||
      ""
  ).trim();

const normalizeDocumentNumber = (
  value
) => String(value || "").trim().toUpperCase();

const normalizeBoolean = (
  value
) =>
  value === true ||
  value === "true";

const serializeAcknowledgementResult = (
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
  confidentialityLevel:
    document.confidentialityLevel,
  employeeCanDownload: Boolean(
    document.employeeCanDownload
  ),
  status: document.status,
  acknowledgementRequired:
    Boolean(
      document
        .acknowledgementRequired
    ),
  acknowledgementDueDate:
    document
      .acknowledgementDueDate ||
    "",
  acknowledgement:
    document.acknowledgement || {},
  currentVersionNumber:
    document.currentVersionNumber,
  updatedAt:
    document.updatedAt,
  history:
    document.history || [],
});

const appendHistory = ({
  document,
  action,
  notes,
  user,
}) => {
  document.history =
    document.history || [];

  document.history.push({
    action,
    fromStatus:
      document.status,
    toStatus:
      document.status,
    performedBy:
      getUserName(user),
    performedByUserId:
      getUserId(user),
    performedAt: new Date(),
    notes:
      String(notes || "").trim(),
  });
};

const acknowledgeControlledDocument =
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
          "Archived" ||
        document.status ===
          "Cancelled" ||
        document.status ===
          "Superseded"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} cannot be acknowledged while its status is ${document.status}.`,
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
        document.status !==
        "Verified"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} must be verified by HR before employee acknowledgement.`,
          data: {
            documentNumber:
              document.documentNumber,
            currentStatus:
              document.status,
            requiredStatus:
              "Verified",
          },
        });
      }

      if (
        !document
          .acknowledgementRequired
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} does not require employee acknowledgement.`,
        });
      }

      if (
        document.confidentialityLevel !==
          "Employee Visible" ||
        !document.employeeCanDownload
      ) {
        return res.status(403).json({
          success: false,
          message:
            "This document is not available for employee acknowledgement.",
        });
      }

      const authenticatedUserId =
        getUserId(req.user);

      const linkedUserId =
        String(
          document.linkedUserId ||
            ""
        ).trim();

      if (
        !authenticatedUserId ||
        !linkedUserId ||
        authenticatedUserId !==
          linkedUserId
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Employees may acknowledge only documents assigned to their own linked employee profile.",
        });
      }

      if (
        document.acknowledgement
          ?.status ===
        "Acknowledged"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${document.documentNumber} has already been acknowledged.`,
          data: {
            documentNumber:
              document.documentNumber,
            acknowledgement:
              document.acknowledgement,
          },
        });
      }

      const confirmed =
        normalizeBoolean(
          req.body.confirmed
        );

      if (!confirmed) {
        return res.status(400).json({
          success: false,
          message:
            "The employee must explicitly confirm that the document was received and reviewed.",
        });
      }

      const acknowledgementComments =
        String(
          req.body.comments || ""
        ).trim();

      const beforeValues = {
        documentNumber:
          document.documentNumber,
        employeeId:
          document.employeeId,
        status:
          document.status,
        acknowledgement:
          document.acknowledgement ||
          {},
      };

      const acknowledgedAt =
        new Date();
      const userName =
        getUserName(req.user);

      document.acknowledgement = {
        status: "Acknowledged",
        acknowledgedBy: userName,
        acknowledgedByUserId:
          authenticatedUserId,
        acknowledgedAt,
        comments:
          acknowledgementComments,
      };

      document.updatedBy = userName;

      appendHistory({
        document,
        action:
          "Employee Acknowledged",
        notes:
          acknowledgementComments ||
          "The employee confirmed receipt and review of the controlled employment document.",
        user: req.user,
      });

      await document.save();

      const afterValues = {
        documentNumber:
          document.documentNumber,
        employeeId:
          document.employeeId,
        status:
          document.status,
        acknowledgement:
          document.acknowledgement,
      };

      await writeAuditLog({
        req,
        action:
          "ACKNOWLEDGE_EMPLOYMENT_DOCUMENT",
        module: "HR",
        description:
          `Employee acknowledged controlled employment document ${document.documentNumber}.`,
        targetType:
          "EmploymentDocument",
        targetId:
          document.documentNumber,
        beforeValues,
        afterValues,
        metadata: {
          employeeId:
            document.employeeId,
          linkedUserId:
            document.linkedUserId,
          versionNumber:
            document
              .currentVersionNumber,
        },
      });

      return res.json({
        success: true,
        message:
          `${document.documentNumber} acknowledged successfully.`,
        data:
          serializeAcknowledgementResult(
            document
          ),
      });
    } catch (error) {
      console.error(
        "Acknowledge controlled employment document error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Failed to acknowledge controlled employment document.",
      });
    }
  };

module.exports = {
  acknowledgeControlledDocument,
};