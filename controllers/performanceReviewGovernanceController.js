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

const getReviewNumber = (req) =>
  normalizeString(
    req.params.reviewNumber
  ).toUpperCase();

const getTodayYmd = () =>
  new Date()
    .toISOString()
    .slice(0, 10);

const isPastDate = (
  dateValue,
  asOfDate
) => {
  const date =
    normalizeString(dateValue);

  return Boolean(
    date &&
    date < asOfDate
  );
};

const getDueDateForStatus = (
  review
) => {
  switch (review.status) {
    case "Goal Setting":
      return normalizeString(
        review.goalSettingDueDate
      );

    case "Self Assessment":
      return normalizeString(
        review.selfAssessmentDueDate
      );

    case "Manager Assessment":
      return normalizeString(
        review.managerAssessmentDueDate
      );

    case "Awaiting Acknowledgement":
      return normalizeString(
        review.acknowledgementDueDate
      );

    case "Improvement Plan":
      return normalizeString(
        review.improvementPlan
          ?.reviewDate
      );

    default:
      return "";
  }
};

const getOverdueAction = (
  review,
  asOfDate
) => {
  const dueDate =
    getDueDateForStatus(
      review
    );

  if (
    !isPastDate(
      dueDate,
      asOfDate
    )
  ) {
    return {
      overdue: false,
      dueDate,
      action: "",
    };
  }

  const actionsByStatus = {
    "Goal Setting":
      "Performance goals are overdue.",

    "Self Assessment":
      "Employee self-assessment is overdue.",

    "Manager Assessment":
      "Manager assessment is overdue.",

    "Awaiting Acknowledgement":
      "Employee acknowledgement is overdue.",

    "Improvement Plan":
      "Improvement-plan review is overdue.",
  };

  return {
    overdue: true,
    dueDate,
    action:
      actionsByStatus[
        review.status
      ] ||
      "Performance workflow action is overdue.",
  };
};

const increaseCount = (
  target,
  key
) => {
  const normalizedKey =
    normalizeString(key) ||
    "Not Specified";

  target[normalizedKey] =
    Number(
      target[normalizedKey] ||
        0
    ) + 1;
};

const getPerformanceReviewMonitor =
  async (req, res) => {
    try {
      const asOfDate =
        normalizeString(
          req.query.asOfDate
        ) ||
        getTodayYmd();

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          asOfDate
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Monitoring as-of date must use YYYY-MM-DD.",
          });
      }

      const query = {};

      const employeeId =
        normalizeString(
          req.query.employeeId
        );

      const cycleCode =
        normalizeString(
          req.query.cycleCode
        ).toUpperCase();

      const status =
        normalizeString(
          req.query.status
        );

      if (employeeId) {
        query.employeeId =
          employeeId;
      }

      if (cycleCode) {
        query.cycleCode =
          cycleCode;
      }

      if (status) {
        query.status =
          status;
      }

      const reviews =
        await PerformanceReview
          .find(query)
          .sort({
            periodEndDate: -1,
            reviewNumber: -1,
          })
          .lean();

      const summary = {
        totalReviews:
          reviews.length,

        openReviews: 0,
        completedReviews: 0,
        cancelledReviews: 0,
        overdueReviews: 0,

        awaitingAcknowledgement: 0,
        acknowledgementOverdue: 0,

        improvementPlansRequired: 0,
        activeImprovementPlans: 0,
        successfulImprovementPlans: 0,
        unsuccessfulImprovementPlans: 0,

        statusCounts: {},
        ratingCounts: {},
        reviewTypeCounts: {},
      };

      const completedStatuses = [
        "Completed",
        "Cancelled",
      ];

      const data =
        reviews.map(
          (review) => {
            const overdueEvidence =
              getOverdueAction(
                review,
                asOfDate
              );

            increaseCount(
              summary.statusCounts,
              review.status
            );

            increaseCount(
              summary.ratingCounts,
              review.finalRating
            );

            increaseCount(
              summary.reviewTypeCounts,
              review.reviewType
            );

            if (
              review.status ===
              "Completed"
            ) {
              summary
                .completedReviews += 1;
            }

            if (
              review.status ===
              "Cancelled"
            ) {
              summary
                .cancelledReviews += 1;
            }

            if (
              !completedStatuses.includes(
                review.status
              )
            ) {
              summary
                .openReviews += 1;
            }

            if (
              overdueEvidence.overdue
            ) {
              summary
                .overdueReviews += 1;
            }

            if (
              review.status ===
              "Awaiting Acknowledgement"
            ) {
              summary
                .awaitingAcknowledgement += 1;

              if (
                overdueEvidence.overdue
              ) {
                summary
                  .acknowledgementOverdue += 1;
              }
            }

            if (
              review.improvementPlan
                ?.required
            ) {
              summary
                .improvementPlansRequired += 1;
            }

            if (
              review.improvementPlan
                ?.status ===
              "Active"
            ) {
              summary
                .activeImprovementPlans += 1;
            }

            if (
              review.improvementPlan
                ?.status ===
              "Successfully Completed"
            ) {
              summary
                .successfulImprovementPlans += 1;
            }

            if (
              review.improvementPlan
                ?.status ===
              "Unsuccessfully Completed"
            ) {
              summary
                .unsuccessfulImprovementPlans += 1;
            }

            return {
              reviewNumber:
                review.reviewNumber,

              employeeId:
                review.employeeId,

              employeeName:
                review.employeeSnapshot
                  ?.fullName ||
                "",

              department:
                review.employeeSnapshot
                  ?.department ||
                "",

              branch:
                review.employeeSnapshot
                  ?.branch ||
                "",

              managerEmployeeId:
                review.managerEmployeeId ||
                "",

              managerName:
                review.managerName ||
                "",

              cycleCode:
                review.cycleCode,

              cycleName:
                review.cycleName,

              reviewType:
                review.reviewType,

              periodStartDate:
                review.periodStartDate,

              periodEndDate:
                review.periodEndDate,

              status:
                review.status,

              finalScore:
                review.finalScore,

              finalRating:
                review.finalRating,

              acknowledgementRequired:
                Boolean(
                  review
                    .acknowledgementRequired
                ),

              acknowledgementStatus:
                review
                  .employeeAcknowledgement
                  ?.status ||
                "Pending",

              improvementPlanRequired:
                Boolean(
                  review
                    .improvementPlan
                    ?.required
                ),

              improvementPlanStatus:
                review
                  .improvementPlan
                  ?.status ||
                "Not Required",

              improvementPlanNumber:
                review
                  .improvementPlan
                  ?.planNumber ||
                "",

              overdue:
                overdueEvidence
                  .overdue,

              dueDate:
                overdueEvidence
                  .dueDate,

              overdueAction:
                overdueEvidence
                  .action,
            };
          }
        );

      return res.json({
        success: true,
        message:
          "Performance-review workflow monitor generated successfully.",
        asOfDate,
        filters: {
          employeeId,
          cycleCode,
          status,
        },
        summary,
        data,
      });
    } catch (error) {
      console.error(
        "Get performance-review monitor error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Failed to generate the performance-review workflow monitor.",
          error:
            error.message,
        });
    }
  };

const cancelPerformanceReview =
  async (req, res) => {
    try {
      const reviewNumber =
        getReviewNumber(req);

      const review =
        await PerformanceReview
          .findOne({
            reviewNumber,
          });

      if (!review) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Controlled performance review not found.",
          });
      }

      if (
        review.status ===
        "Completed"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "A completed performance review cannot be cancelled. A controlled correction or replacement workflow is required.",
          });
      }

      if (
        review.status ===
        "Cancelled"
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              `${review.reviewNumber} has already been cancelled.`,
          });
      }

      const cancellationReason =
        normalizeString(
          req.body
            .cancellationReason
        );

      if (!cancellationReason) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "A performance-review cancellation reason is required.",
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
              "Performance-review cancellation confirmation is required.",
          });
      }

      const fromStatus =
        review.status;

      const previousPlanStatus =
        review.improvementPlan
          ?.status ||
        "Not Required";

      if (
        review.improvementPlan
          ?.required &&
        [
          "Draft",
          "Active",
        ].includes(
          review.improvementPlan
            .status
        )
      ) {
        review
          .improvementPlan
          .status =
          "Cancelled";

        review
          .improvementPlan
          .outcomeNotes =
          cancellationReason;

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
      }

      review.status =
        "Cancelled";

      review.cancelledAt =
        new Date();

      review.cancelledBy =
        getUserName(req.user);

      review.cancellationReason =
        cancellationReason;

      review.updatedBy =
        getUserName(req.user);

      review.history.push({
        action:
          "Performance Review Cancelled",

        fromStatus,

        toStatus:
          "Cancelled",

        notes:
          cancellationReason,

        performedBy:
          getUserName(req.user),

        performedByUserId:
          getUserId(req.user),

        performedAt:
          new Date(),
      });

      await review.save();

      await writeAuditLog({
        req,

        action:
          "Performance Review Cancelled",

        module:
          "HR",

        description:
          `${review.reviewNumber} was cancelled through the controlled H8 workflow.`,

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

          previousImprovementPlanStatus:
            previousPlanStatus,

          currentImprovementPlanStatus:
            review.improvementPlan
              ?.status ||
            "Not Required",
        },

        beforeValues: {
          status:
            fromStatus,
        },

        afterValues: {
          status:
            "Cancelled",
        },
      });

      return res.json({
        success: true,
        message:
          `${review.reviewNumber} cancelled successfully.`,
        data: review,
      });
    } catch (error) {
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
        "Cancel performance review error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Failed to cancel the controlled performance review.",
          error:
            error.message,
        });
    }
  };

module.exports = {
  getPerformanceReviewMonitor,
  cancelPerformanceReview,
};