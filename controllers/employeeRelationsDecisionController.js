const EmployeeRelationsCase = require(
  "../models/EmployeeRelationsCase"
);

const {
  writeAuditLog,
} = require(
  "../utils/auditLogger"
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
      user?.email ||
      "System"
  );

const getLinkedEmployeeId = (
  user
) =>
  normalizeString(
    user?.linkedEmployeeId ||
      user?.employeeId
  );

const getCaseNumber = (req) =>
  normalizeString(
    req.params.caseNumber
  ).toUpperCase();

const getCaseRecord = async (
  req,
  res
) => {
  const caseNumber =
    getCaseNumber(req);

  const record =
    await EmployeeRelationsCase
      .findOne({
        caseNumber,
      });

  if (!record) {
    res.status(404).json({
      success: false,
      message:
        "Controlled employee-relations case not found.",
    });

    return null;
  }

  return record;
};

const isAcknowledgementOwner = (
  record,
  user
) => {
  const userId =
    getUserId(user);

  const linkedEmployeeId =
    getLinkedEmployeeId(
      user
    );

  if (
    record.caseType ===
    "Discipline"
  ) {
    return Boolean(
      (
        userId &&
        userId ===
          record
            .subjectLinkedUserId
      ) ||
      (
        linkedEmployeeId &&
        linkedEmployeeId ===
          record
            .subjectEmployeeId
      )
    );
  }

  return Boolean(
    (
      userId &&
      userId ===
        record
          .complainantLinkedUserId
    ) ||
    (
      linkedEmployeeId &&
      linkedEmployeeId ===
        record
          .complainantEmployeeId
    )
  );
};

const addHistory = ({
  record,
  action,
  fromStatus,
  toStatus,
  notes,
  req,
}) => {
  record.history.push({
    action,
    fromStatus,
    toStatus,
    notes:
      normalizeString(notes),
    performedBy:
      getUserName(req.user),
    performedByUserId:
      getUserId(req.user),
    performedAt:
      new Date(),
  });
};

const sendDecisionError = (
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

const issueCaseDecision =
  async (req, res) => {
    try {
      const record =
        await getCaseRecord(
          req,
          res
        );

      if (!record) {
        return;
      }

      if (
        record.status !==
        "Awaiting Decision"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `A decision can be issued only when the case is Awaiting Decision. Current status: ${record.status}.`,
          });
      }

      if (
        record.decision?.issued
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `${record.caseNumber} already has an issued decision.`,
          });
      }

      const outcome =
        normalizeString(
          req.body.outcome
        );

      const summary =
        normalizeString(
          req.body.summary
        );

      const reasons =
        normalizeString(
          req.body.reasons
        );

      if (
        !outcome ||
        !summary ||
        !reasons
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Decision outcome, summary and reasons are required.",
          });
      }

      const acknowledgementRequired =
        req.body
          .acknowledgementRequired !==
        false;

      const actorName =
        getUserName(
          req.user
        );

      const actorUserId =
        getUserId(
          req.user
        );

      const fromStatus =
        record.status;

      record.decision = {
        issued: true,
        outcome,
        summary,
        reasons,

        actionRequired:
          normalizeString(
            req.body
              .actionRequired
          ),

        effectiveDate:
          normalizeString(
            req.body
              .effectiveDate
          ),

        reviewDate:
          normalizeString(
            req.body
              .reviewDate
          ),

        decisionDocumentNumber:
          normalizeString(
            req.body
              .decisionDocumentNumber
          ),

        issuedBy:
          actorName,

        issuedByUserId:
          actorUserId,

        issuedAt:
          new Date(),
      };

      record
        .employeeAcknowledgement =
        {
          required:
            acknowledgementRequired,

          status:
            acknowledgementRequired
              ? "Pending"
              : "Not Required",

          acknowledgedBy:
            "",

          acknowledgedByUserId:
            "",

          acknowledgedAt:
            null,

          receiptConfirmed:
            false,

          comments:
            "",
        };

      record.status =
        acknowledgementRequired
          ? "Awaiting Acknowledgement"
          : "Decision Issued";

      record.updatedBy =
        actorName;

      addHistory({
        record,
        action:
          "Decision Issued",
        fromStatus,
        toStatus:
          record.status,
        notes:
          `Outcome: ${outcome}. ${summary}`,
        req,
      });

      await record.save();

      await writeAuditLog({
        req,
        action:
          "Employee Relations Decision Issued",
        module:
          "HR",

        description:
          `A controlled decision was issued for ${record.caseNumber}.`,

        targetType:
          "EmployeeRelationsCase",

        targetId:
          record.caseNumber,

        metadata: {
          caseType:
            record.caseType,

          subjectEmployeeId:
            record
              .subjectEmployeeId,

          complainantEmployeeId:
            record
              .complainantEmployeeId,

          acknowledgementRequired,

          decisionDocumentNumber:
            record
              .decision
              .decisionDocumentNumber,
        },

        beforeValues: {
          status:
            fromStatus,
          decisionIssued:
            false,
        },

        afterValues: {
          status:
            record.status,
          decisionIssued:
            true,
          outcome,
        },
      });

      return res.json({
        success: true,

        message:
          acknowledgementRequired
            ? `${record.caseNumber} decision issued successfully and is awaiting employee acknowledgement.`
            : `${record.caseNumber} decision issued successfully.`,

        data:
          record,
      });
    } catch (error) {
      return sendDecisionError(
        res,
        error,
        "Failed to issue the controlled employee-relations decision."
      );
    }
  };

const acknowledgeCaseDecision =
  async (req, res) => {
    try {
      const record =
        await getCaseRecord(
          req,
          res
        );

      if (!record) {
        return;
      }

      if (
        !isAcknowledgementOwner(
          record,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "Only the linked employee assigned to this case may acknowledge receipt of its decision.",
          });
      }

      if (
        !record
          .decision
          ?.issued
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "This case does not yet have an issued decision.",
          });
      }

      if (
        !record
          .employeeAcknowledgement
          ?.required
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              `${record.caseNumber} does not require employee acknowledgement.`,
          });
      }

      if (
        record
          .employeeAcknowledgement
          ?.status ===
        "Acknowledged"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              `${record.caseNumber} has already been acknowledged.`,

            data: {
              caseNumber:
                record.caseNumber,

              acknowledgement:
                record
                  .employeeAcknowledgement,
            },
          });
      }

      if (
        record.status !==
        "Awaiting Acknowledgement"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              `This case cannot be acknowledged from ${record.status}.`,
          });
      }

      if (
        req.body
          .receiptConfirmed !==
        true
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "The employee must expressly confirm receipt of the decision.",
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

      const fromStatus =
        record.status;

      record
        .employeeAcknowledgement =
        {
          required:
            true,

          status:
            "Acknowledged",

          acknowledgedBy:
            actorName,

          acknowledgedByUserId:
            actorUserId,

          acknowledgedAt:
            new Date(),

          receiptConfirmed:
            true,

          comments:
            normalizeString(
              req.body.comments
            ),
        };

      record.status =
        "Decision Issued";

      record.updatedBy =
        actorName;

      addHistory({
        record,
        action:
          "Employee Acknowledged",
        fromStatus,
        toStatus:
          record.status,

        notes:
          "The linked employee confirmed receipt of the decision. Receipt acknowledgement does not indicate agreement and does not waive appeal rights.",

        req,
      });

      await record.save();

      await writeAuditLog({
        req,

        action:
          "Employee Relations Decision Acknowledged",

        module:
          "HR",

        description:
          `The linked employee acknowledged receipt of the decision for ${record.caseNumber}.`,

        targetType:
          "EmployeeRelationsCase",

        targetId:
          record.caseNumber,

        metadata: {
          caseType:
            record.caseType,

          employeeId:
            record.caseType ===
            "Discipline"
              ? record
                  .subjectEmployeeId
              : record
                  .complainantEmployeeId,

          receiptOnly:
            true,

          appealRightsPreserved:
            true,
        },

        beforeValues: {
          status:
            fromStatus,

          acknowledgementStatus:
            "Pending",
        },

        afterValues: {
          status:
            record.status,

          acknowledgementStatus:
            "Acknowledged",
        },
      });

      return res.json({
        success: true,

        message:
          `${record.caseNumber} receipt acknowledged successfully. This acknowledgement does not indicate agreement and does not waive appeal rights.`,

        data: {
          caseNumber:
            record.caseNumber,

          status:
            record.status,

          acknowledgement:
            record
              .employeeAcknowledgement,
        },
      });
    } catch (error) {
      return sendDecisionError(
        res,
        error,
        "Failed to acknowledge receipt of the controlled case decision."
      );
    }
  };

module.exports = {
  issueCaseDecision,
  acknowledgeCaseDecision,
};