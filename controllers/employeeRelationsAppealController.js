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
  const record =
    await EmployeeRelationsCase
      .findOne({
        caseNumber:
          getCaseNumber(req),
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

const isEmployeeCaseOwner = (
  record,
  user
) => {
  const userId =
    getUserId(user);

  const employeeId =
    getLinkedEmployeeId(user);

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
        employeeId &&
        employeeId ===
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
      employeeId &&
      employeeId ===
        record
          .complainantEmployeeId
    )
  );
};

const isGrievanceComplainant = (
  record,
  user
) => {
  if (
    record.caseType !==
    "Grievance"
  ) {
    return false;
  }

  const userId =
    getUserId(user);

  const employeeId =
    getLinkedEmployeeId(user);

  return Boolean(
    (
      userId &&
      userId ===
        record
          .complainantLinkedUserId
    ) ||
    (
      employeeId &&
      employeeId ===
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

const writeTransitionAudit =
  async ({
    req,
    record,
    action,
    description,
    fromStatus,
    toStatus,
    metadata = {},
  }) => {
    await writeAuditLog({
      req,
      action,
      module: "HR",
      description,

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

        ...metadata,
      },

      beforeValues: {
        status:
          fromStatus,
      },

      afterValues: {
        status:
          toStatus,
      },
    });
  };

const sendAppealError = (
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

const submitCaseAppeal =
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
        !isEmployeeCaseOwner(
          record,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "Only the linked employee assigned to this case may submit its appeal.",
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
              "An appeal cannot be submitted before a case decision is issued.",
          });
      }

      const allowedStatuses = [
        "Awaiting Acknowledgement",
        "Decision Issued",
      ];

      if (
        !allowedStatuses.includes(
          record.status
        )
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              `An appeal cannot be submitted from ${record.status}.`,
          });
      }

      const activeAppeal =
        (record.appeals || [])
          .find((appeal) =>
            [
              "Submitted",
              "Under Review",
              "Hearing Scheduled",
            ].includes(
              appeal.status
            )
          );

      if (activeAppeal) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              `${record.caseNumber} already has an active appeal.`,

            data: {
              appealNumber:
                activeAppeal
                  .appealNumber,

              status:
                activeAppeal
                  .status,
            },
          });
      }

      const grounds =
        normalizeString(
          req.body.grounds
        );

      if (!grounds) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Appeal grounds are required.",
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

      const appealNumber =
        `APL-${Date.now()}-${Math.floor(
          1000 +
            Math.random() *
              9000
        )}`;

      const fromStatus =
        record.status;

      record.appeals.push({
        appealNumber,

        grounds,

        requestedOutcome:
          normalizeString(
            req.body
              .requestedOutcome
          ),

        status:
          "Submitted",

        submittedBy:
          actorName,

        submittedByUserId:
          actorUserId,

        submittedAt:
          new Date(),
      });

      record.status =
        "Appeal Submitted";

      record.updatedBy =
        actorName;

      addHistory({
        record,
        action:
          "Appeal Submitted",

        fromStatus,

        toStatus:
          record.status,

        notes:
          `${appealNumber}: ${grounds}`,

        req,
      });

      await record.save();

      await writeTransitionAudit({
        req,
        record,

        action:
          "Employee Relations Appeal Submitted",

        description:
          `Appeal ${appealNumber} was submitted for ${record.caseNumber}.`,

        fromStatus,

        toStatus:
          record.status,

        metadata: {
          appealNumber,

          receiptAcknowledged:
            record
              .employeeAcknowledgement
              ?.status ===
            "Acknowledged",
        },
      });

      return res
        .status(201)
        .json({
          success: true,

          message:
            `${appealNumber} submitted successfully.`,

          data: {
            caseNumber:
              record.caseNumber,

            status:
              record.status,

            appeal:
              record.appeals[
                record
                  .appeals
                  .length -
                  1
              ],
          },
        });
    } catch (error) {
      return sendAppealError(
        res,
        error,
        "Failed to submit the controlled case appeal."
      );
    }
  };

const decideCaseAppeal =
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
        ![
          "Appeal Submitted",
          "Appeal Review",
        ].includes(
          record.status
        )
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              `An appeal cannot be decided while the case is ${record.status}.`,
          });
      }

      const appealNumber =
        normalizeString(
          req.params
            .appealNumber
        );

      const appeal =
        record.appeals.find(
          (item) =>
            item
              .appealNumber ===
            appealNumber
        );

      if (!appeal) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Controlled case appeal not found.",
          });
      }

      if (
        ![
          "Submitted",
          "Under Review",
          "Hearing Scheduled",
        ].includes(
          appeal.status
        )
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              `${appealNumber} has already reached ${appeal.status}.`,
          });
      }

      const outcome =
        normalizeString(
          req.body.outcome
        );

      const allowedOutcomes = [
        "Upheld",
        "Partially Upheld",
        "Dismissed",
      ];

      if (
        !allowedOutcomes.includes(
          outcome
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Appeal outcome must be Upheld, Partially Upheld or Dismissed.",
          });
      }

      const decision =
        normalizeString(
          req.body.decision
        );

      const decisionReason =
        normalizeString(
          req.body
            .decisionReason
        );

      if (
        !decision ||
        !decisionReason
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Appeal decision and decision reason are required.",
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

      appeal.status =
        outcome;

      appeal.decision =
        decision;

      appeal.decisionReason =
        decisionReason;

      appeal.decidedBy =
        actorName;

      appeal.decidedByUserId =
        actorUserId;

      appeal.decidedAt =
        new Date();

      const fromStatus =
        record.status;

      record.status =
        "Decision Issued";

      record.updatedBy =
        actorName;

      addHistory({
        record,
        action:
          "Appeal Decided",

        fromStatus,

        toStatus:
          record.status,

        notes:
          `${appealNumber}: ${outcome}. ${decisionReason}`,

        req,
      });

      await record.save();

      await writeTransitionAudit({
        req,
        record,

        action:
          "Employee Relations Appeal Decided",

        description:
          `Appeal ${appealNumber} was decided for ${record.caseNumber}.`,

        fromStatus,

        toStatus:
          record.status,

        metadata: {
          appealNumber,
          outcome,
        },
      });

      return res.json({
        success: true,

        message:
          `${appealNumber} decided successfully.`,

        data:
          record,
      });
    } catch (error) {
      return sendAppealError(
        res,
        error,
        "Failed to decide the controlled case appeal."
      );
    }
  };

const withdrawGrievanceCase =
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
        !isGrievanceComplainant(
          record,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "Only the linked grievance complainant may withdraw this case.",
          });
      }

      const allowedStatuses = [
        "Submitted",
        "Under Review",
        "Investigation",
      ];

      if (
        !allowedStatuses.includes(
          record.status
        )
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              `A grievance cannot be withdrawn from ${record.status}.`,
          });
      }

      const withdrawalReason =
        normalizeString(
          req.body
            .withdrawalReason
        );

      if (
        !withdrawalReason
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "A grievance withdrawal reason is required.",
          });
      }

      const actorName =
        getUserName(
          req.user
        );

      const fromStatus =
        record.status;

      record.status =
        "Withdrawn";

      record.withdrawnBy =
        actorName;

      record.withdrawnAt =
        new Date();

      record.withdrawalReason =
        withdrawalReason;

      record.updatedBy =
        actorName;

      addHistory({
        record,
        action:
          "Withdrawn",

        fromStatus,

        toStatus:
          record.status,

        notes:
          withdrawalReason,

        req,
      });

      await record.save();

      await writeTransitionAudit({
        req,
        record,

        action:
          "Employee Grievance Withdrawn",

        description:
          `The complainant withdrew grievance ${record.caseNumber}.`,

        fromStatus,

        toStatus:
          record.status,
      });

      return res.json({
        success: true,

        message:
          `${record.caseNumber} withdrawn successfully.`,

        data: {
          caseNumber:
            record.caseNumber,

          status:
            record.status,

          withdrawnBy:
            record.withdrawnBy,

          withdrawnAt:
            record.withdrawnAt,

          withdrawalReason:
            record
              .withdrawalReason,
        },
      });
    } catch (error) {
      return sendAppealError(
        res,
        error,
        "Failed to withdraw the controlled grievance."
      );
    }
  };

const closeEmployeeRelationsCase =
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
        "Decision Issued"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              `Only a Decision Issued case can be closed. Current status: ${record.status}.`,
          });
      }

      const activeAppeal =
        (record.appeals || [])
          .find((appeal) =>
            [
              "Submitted",
              "Under Review",
              "Hearing Scheduled",
            ].includes(
              appeal.status
            )
          );

      if (activeAppeal) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              `${record.caseNumber} cannot be closed while ${activeAppeal.appealNumber} is active.`,
          });
      }

      if (
        record
          .employeeAcknowledgement
          ?.required &&
        record
          .employeeAcknowledgement
          ?.status !==
          "Acknowledged"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              `${record.caseNumber} cannot be closed before the required employee receipt acknowledgement is completed.`,
          });
      }

      const closureSummary =
        normalizeString(
          req.body
            .closureSummary
        );

      if (!closureSummary) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "A controlled case closure summary is required.",
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

      record.status =
        "Closed";

      record.closureSummary =
        closureSummary;

      record.closedBy =
        actorName;

      record.closedByUserId =
        actorUserId;

      record.closedAt =
        new Date();

      record.updatedBy =
        actorName;

      addHistory({
        record,
        action:
          "Closed",

        fromStatus,

        toStatus:
          record.status,

        notes:
          closureSummary,

        req,
      });

      await record.save();

      await writeTransitionAudit({
        req,
        record,

        action:
          "Employee Relations Case Closed",

        description:
          `Controlled case ${record.caseNumber} was closed.`,

        fromStatus,

        toStatus:
          record.status,

        metadata: {
          noAutomaticEmploymentEffect:
            true,

          noAutomaticPayrollEffect:
            true,
        },
      });

      return res.json({
        success: true,

        message:
          `${record.caseNumber} closed successfully.`,

        data:
          record,
      });
    } catch (error) {
      return sendAppealError(
        res,
        error,
        "Failed to close the controlled employee-relations case."
      );
    }
  };

module.exports = {
  submitCaseAppeal,
  decideCaseAppeal,
  withdrawGrievanceCase,
  closeEmployeeRelationsCase,
};