const PerformanceReview = require(
  "../models/PerformanceReview"
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

const getReviewNumber = (req) =>
  normalizeString(
    req.params.reviewNumber
  ).toUpperCase();

const getPerformanceReview = async (
  req,
  res
) => {
  const review =
    await PerformanceReview.findOne({
      reviewNumber:
        getReviewNumber(req),
    });

  if (!review) {
    res.status(404).json({
      success: false,
      message:
        "Controlled performance review not found.",
    });

    return null;
  }

  return review;
};

const isEmployeeReviewOwner = (
  review,
  user
) => {
  const userId =
    getUserId(user);

  const linkedEmployeeId =
    getLinkedEmployeeId(user);

  return Boolean(
    (
      userId &&
      userId ===
        normalizeString(
          review.linkedUserId
        )
    ) ||
    (
      linkedEmployeeId &&
      linkedEmployeeId ===
        normalizeString(
          review.employeeId
        )
    )
  );
};

const addHistory = ({
  review,
  action,
  fromStatus,
  toStatus,
  notes,
  req,
}) => {
  review.history.push({
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
    review,
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
        "PerformanceReview",

      targetId:
        review.reviewNumber,

      metadata: {
        employeeId:
          review.employeeId,

        cycleCode:
          review.cycleCode,

        reviewType:
          review.reviewType,

        finalRating:
          review.finalRating,

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

const sendCompletionError = (
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

const acknowledgePerformanceReview =
  async (req, res) => {
    try {
      const review =
        await getPerformanceReview(
          req,
          res
        );

      if (!review) {
        return;
      }

      if (
        !isEmployeeReviewOwner(
          review,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "Employees may acknowledge only performance reviews assigned to their own linked employee profile.",
          });
      }

      if (
        review.status !==
        "Awaiting Acknowledgement"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `A performance review may be acknowledged only while Awaiting Acknowledgement. Current status: ${review.status}.`,
          });
      }

      if (
        !review
          .acknowledgementRequired
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `${review.reviewNumber} does not require employee acknowledgement.`,
          });
      }

      if (
        review
          .employeeAcknowledgement
          ?.status ===
          "Acknowledged" ||
        review
          .employeeAcknowledgement
          ?.status ===
          "Acknowledged with Comments"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `${review.reviewNumber} has already been acknowledged.`,
            data: {
              reviewNumber:
                review.reviewNumber,

              employeeAcknowledgement:
                review
                  .employeeAcknowledgement,
            },
          });
      }

      if (
        req.body.confirmed !==
        true
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Employee acknowledgement confirmation is required.",
          });
      }

      const comments =
        normalizeString(
          req.body.comments
        );

      const fromStatus =
        review.status;

      const improvementPlanRequired =
        Boolean(
          review
            .improvementPlan
            ?.required
        );

      const toStatus =
        improvementPlanRequired
          ? "Improvement Plan"
          : "Completed";

      review
        .employeeAcknowledgement
        .status =
        comments
          ? "Acknowledged with Comments"
          : "Acknowledged";

      review
        .employeeAcknowledgement
        .acknowledgedBy =
        getUserName(req.user);

      review
        .employeeAcknowledgement
        .acknowledgedByUserId =
        getUserId(req.user);

      review
        .employeeAcknowledgement
        .acknowledgedAt =
        new Date();

      review
        .employeeAcknowledgement
        .comments =
        comments;

      review.status =
        toStatus;

      if (
        improvementPlanRequired
      ) {
        if (
          review
            .improvementPlan
            .status ===
          "Not Required"
        ) {
          review
            .improvementPlan
            .status =
            "Draft";
        }
      } else {
        review.completedAt =
          new Date();
      }

      review.updatedBy =
        getUserName(req.user);

      addHistory({
        review,
        action:
          "Employee Acknowledged",

        fromStatus,
        toStatus,

        notes:
          comments ||
          "The employee acknowledged the completed performance review.",

        req,
      });

      await review.save();

      await writeTransitionAudit({
        req,
        review,

        action:
          "Performance Review Acknowledged",

        description:
          `${review.reviewNumber} was acknowledged by the assigned employee.`,

        fromStatus,
        toStatus,

        metadata: {
          acknowledgementStatus:
            review
              .employeeAcknowledgement
              .status,

          improvementPlanRequired,
        },
      });

      return res.json({
        success: true,
        message:
          improvementPlanRequired
            ? `${review.reviewNumber} acknowledged successfully and moved to the improvement-plan stage.`
            : `${review.reviewNumber} acknowledged and completed successfully.`,
        data: review,
      });
    } catch (error) {
      return sendCompletionError(
        res,
        error,
        "Failed to acknowledge the controlled performance review."
      );
    }
  };

const activatePerformanceImprovementPlan =
  async (req, res) => {
    try {
      const review =
        await getPerformanceReview(
          req,
          res
        );

      if (!review) {
        return;
      }

      if (
        review.status !==
        "Improvement Plan"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `An improvement plan may be activated only when the review is in Improvement Plan status. Current status: ${review.status}.`,
          });
      }

      if (
        !review
          .improvementPlan
          ?.required
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `${review.reviewNumber} does not require an improvement plan.`,
          });
      }

      if (
        review
          .improvementPlan
          .status ===
        "Active"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `${review.reviewNumber} already has an active improvement plan.`,
          });
      }

      if (
        review
          .improvementPlan
          .status !==
        "Draft"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `Only a Draft improvement plan may be activated. Current plan status: ${review.improvementPlan.status}.`,
          });
      }

      const reason =
        normalizeString(
          req.body.reason ||
            review
              .improvementPlan
              .reason
        );

      const expectedImprovement =
        normalizeString(
          req.body
            .expectedImprovement ||
            review
              .improvementPlan
              .expectedImprovement
        );

      const supportProvided =
        normalizeString(
          req.body
            .supportProvided ||
            review
              .improvementPlan
              .supportProvided
        );

      const startDate =
        normalizeString(
          req.body.startDate ||
            review
              .improvementPlan
              .startDate
        );

      const reviewDate =
        normalizeString(
          req.body.reviewDate ||
            review
              .improvementPlan
              .reviewDate
        );

      if (
        !reason ||
        !expectedImprovement ||
        !supportProvided ||
        !startDate ||
        !reviewDate
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Improvement-plan reason, expected improvement, support provided, start date and review date are required.",
          });
      }

      const fromStatus =
        review.status;

      if (
        !normalizeString(
          review
            .improvementPlan
            .planNumber
        )
      ) {
        review
          .improvementPlan
          .planNumber =
          `PIP-${review.reviewNumber}`;
      }

      review
        .improvementPlan
        .reason =
        reason;

      review
        .improvementPlan
        .expectedImprovement =
        expectedImprovement;

      review
        .improvementPlan
        .supportProvided =
        supportProvided;

      review
        .improvementPlan
        .startDate =
        startDate;

      review
        .improvementPlan
        .reviewDate =
        reviewDate;

      review
        .improvementPlan
        .status =
        "Active";

      if (
        !review
          .improvementPlan
          .createdAt
      ) {
        review
          .improvementPlan
          .createdAt =
          new Date();
      }

      if (
        !normalizeString(
          review
            .improvementPlan
            .createdBy
        )
      ) {
        review
          .improvementPlan
          .createdBy =
          getUserName(req.user);
      }

      if (
        !normalizeString(
          review
            .improvementPlan
            .createdByUserId
        )
      ) {
        review
          .improvementPlan
          .createdByUserId =
          getUserId(req.user);
      }

      review.updatedBy =
        getUserName(req.user);

      addHistory({
        review,

        action:
          "Improvement Plan Activated",

        fromStatus,
        toStatus:
          "Improvement Plan",

        notes:
          normalizeString(
            req.body.activationNotes
          ) ||
          "HR activated the controlled performance improvement plan.",

        req,
      });

      await review.save();

      await writeTransitionAudit({
        req,
        review,

        action:
          "Performance Improvement Plan Activated",

        description:
          `${review.improvementPlan.planNumber} was activated for ${review.reviewNumber}.`,

        fromStatus,
        toStatus:
          "Improvement Plan",

        metadata: {
          planNumber:
            review
              .improvementPlan
              .planNumber,

          planStatus:
            review
              .improvementPlan
              .status,

          startDate:
            review
              .improvementPlan
              .startDate,

          reviewDate:
            review
              .improvementPlan
              .reviewDate,
        },
      });

      return res.json({
        success: true,
        message:
          `${review.improvementPlan.planNumber} activated successfully.`,
        data: review,
      });
    } catch (error) {
      return sendCompletionError(
        res,
        error,
        "Failed to activate the controlled performance improvement plan."
      );
    }
  };

const completePerformanceImprovementPlan =
  async (req, res) => {
    try {
      const review =
        await getPerformanceReview(
          req,
          res
        );

      if (!review) {
        return;
      }

      if (
        review.status !==
        "Improvement Plan"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `An improvement-plan outcome may be recorded only while the review is in Improvement Plan status. Current status: ${review.status}.`,
          });
      }

      if (
        !review
          .improvementPlan
          ?.required
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `${review.reviewNumber} does not require an improvement plan.`,
          });
      }

      if (
        review
          .improvementPlan
          .status !==
        "Active"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `Only an Active improvement plan may be completed. Current plan status: ${review.improvementPlan.status}.`,
          });
      }

      const outcome =
        normalizeString(
          req.body.outcome
        );

      const validOutcomes = [
        "Successfully Completed",
        "Unsuccessfully Completed",
      ];

      if (
        !validOutcomes.includes(
          outcome
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Improvement-plan outcome must be Successfully Completed or Unsuccessfully Completed.",
          });
      }

      const outcomeNotes =
        normalizeString(
          req.body.outcomeNotes
        );

      const completionDate =
        normalizeString(
          req.body.completionDate
        );

      if (
        !outcomeNotes ||
        !completionDate
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Improvement-plan outcome notes and completion date are required.",
          });
      }

      const fromStatus =
        review.status;

      review
        .improvementPlan
        .status =
        outcome;

      review
        .improvementPlan
        .completionDate =
        completionDate;

      review
        .improvementPlan
        .outcomeNotes =
        outcomeNotes;

      review
        .improvementPlan
        .completedBy =
        getUserName(req.user);

      review
        .improvementPlan
        .completedByUserId =
        getUserId(req.user);

      review
        .improvementPlan
        .completedAt =
        new Date();

      review.status =
        "Completed";

      review.completedAt =
        new Date();

      review.updatedBy =
        getUserName(req.user);

      addHistory({
        review,

        action:
          outcome ===
          "Successfully Completed"
            ? "Improvement Plan Successfully Completed"
            : "Improvement Plan Unsuccessfully Completed",

        fromStatus,
        toStatus:
          "Completed",

        notes:
          outcomeNotes,

        req,
      });

      await review.save();

      await writeTransitionAudit({
        req,
        review,

        action:
          "Performance Improvement Plan Completed",

        description:
          `${review.improvementPlan.planNumber || "The improvement plan"} for ${review.reviewNumber} was marked ${outcome}.`,

        fromStatus,
        toStatus:
          "Completed",

        metadata: {
          planNumber:
            review
              .improvementPlan
              .planNumber,

          planOutcome:
            outcome,

          completionDate,
        },
      });

      return res.json({
        success: true,
        message:
          `${review.improvementPlan.planNumber || "Performance improvement plan"} marked ${outcome}, and ${review.reviewNumber} was completed successfully.`,
        data: review,
      });
    } catch (error) {
      return sendCompletionError(
        res,
        error,
        "Failed to complete the controlled performance improvement plan."
      );
    }
  };

module.exports = {
  acknowledgePerformanceReview,
  activatePerformanceImprovementPlan,
  completePerformanceImprovementPlan,
};