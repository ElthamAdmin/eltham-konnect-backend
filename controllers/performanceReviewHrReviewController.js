const PerformanceReview = require(
  "../models/PerformanceReview"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const normalizeString = (value) =>
  String(value || "").trim();

const normalizeUpper = (value) =>
  normalizeString(value).toUpperCase();

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

const isValidYmdDate = (value) => {
  const text =
    normalizeString(value);

  if (!YMD_PATTERN.test(text)) {
    return false;
  }

  const date =
    new Date(
      `${text}T12:00:00.000Z`
    );

  return (
    !Number.isNaN(
      date.getTime()
    ) &&
    date
      .toISOString()
      .slice(0, 10) === text
  );
};

const isValidScore = (value) => {
  const score =
    Number(value);

  return (
    Number.isFinite(score) &&
    score >= 1 &&
    score <= 5
  );
};

const getRatingFromScore = (
  value
) => {
  const score =
    Number(value);

  if (score >= 4.5) {
    return "Excellent";
  }

  if (score >= 3.5) {
    return "Very Good";
  }

  if (score >= 2.5) {
    return "Good";
  }

  if (score >= 1.5) {
    return "Needs Improvement";
  }

  return "Unsatisfactory";
};

const requiresImprovementPlan = (
  rating
) =>
  [
    "Needs Improvement",
    "Unsatisfactory",
  ].includes(rating);

const createImprovementPlanNumber = (
  reviewNumber
) =>
  `PIP-${normalizeUpper(
    reviewNumber
  )}`;

const getReviewRecord = async (
  req,
  res
) => {
  const reviewNumber =
    normalizeUpper(
      req.params.reviewNumber
    );

  const record =
    await PerformanceReview
      .findOne({
        reviewNumber,
      });

  if (!record) {
    res.status(404).json({
      success: false,

      message:
        "Controlled performance review not found.",
    });

    return null;
  }

  return record;
};

const sendHrReviewError = (
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

const returnManagerAssessment =
  async (req, res) => {
    try {
      const record =
        await getReviewRecord(
          req,
          res
        );

      if (!record) {
        return;
      }

      if (
        record.status !==
          "HR Review" ||
        record
          .managerAssessment
          .status !==
          "Submitted"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "Only a submitted manager assessment awaiting HR review can be returned.",

            data: {
              reviewNumber:
                record.reviewNumber,

              currentStatus:
                record.status,

              managerAssessmentStatus:
                record
                  .managerAssessment
                  .status,
            },
          });
      }

      const returnReason =
        normalizeString(
          req.body.returnReason
        );

      if (!returnReason) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "An HR return reason is required.",
          });
      }

      const returnedAt =
        new Date();

      const fromStatus =
        record.status;

      record
        .managerAssessment
        .status =
        "Returned";

      record
        .managerAssessment
        .returnedBy =
        getUserName(req.user);

      record
        .managerAssessment
        .returnedAt =
        returnedAt;

      record
        .managerAssessment
        .returnReason =
        returnReason;

      record.hrReview = {
        status: "Returned",

        reviewedBy:
          getUserName(req.user),

        reviewedByUserId:
          getUserId(req.user),

        reviewedAt:
          returnedAt,

        notes: "",

        returnReason,
      };

      record.status =
        "Manager Assessment";

      record.updatedBy =
        getUserName(req.user);

      record.history.push({
        action:
          "Manager Assessment Returned",

        fromStatus,

        toStatus:
          "Manager Assessment",

        notes:
          returnReason,

        performedBy:
          getUserName(req.user),

        performedByUserId:
          getUserId(req.user),

        performedAt:
          returnedAt,
      });

      await record.save();

      await writeAuditLog({
        req,

        action:
          "Performance Manager Assessment Returned",

        module: "HR",

        description:
          `${record.reviewNumber} manager assessment was returned by HR.`,

        targetType:
          "PerformanceReview",

        targetId:
          record.reviewNumber,

        metadata: {
          employeeId:
            record.employeeId,

          managerEmployeeId:
            record
              .managerEmployeeId,

          cycleCode:
            record.cycleCode,

          returnReason,
        },

        beforeValues: {
          status:
            fromStatus,

          managerAssessmentStatus:
            "Submitted",

          hrReviewStatus:
            "Pending",
        },

        afterValues: {
          status:
            record.status,

          managerAssessmentStatus:
            record
              .managerAssessment
              .status,

          hrReviewStatus:
            record
              .hrReview
              .status,
        },
      });

      return res.json({
        success: true,

        message:
          "Manager assessment returned successfully.",

        data: record,
      });
    } catch (error) {
      return sendHrReviewError(
        res,
        error,
        "Failed to return the manager assessment."
      );
    }
  };

const approvePerformanceReviewByHr =
  async (req, res) => {
    try {
      const record =
        await getReviewRecord(
          req,
          res
        );

      if (!record) {
        return;
      }

      if (
        record.status !==
          "HR Review" ||
        record
          .managerAssessment
          .status !==
          "Submitted"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "Only a submitted manager assessment awaiting HR review can be approved.",

            data: {
              reviewNumber:
                record.reviewNumber,

              currentStatus:
                record.status,

              managerAssessmentStatus:
                record
                  .managerAssessment
                  .status,
            },
          });
      }

      const hrNotes =
        normalizeString(
          req.body.hrNotes
        );

      const finalSummary =
        normalizeString(
          req.body.finalSummary
        );

      if (
        !hrNotes ||
        !finalSummary
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "HR review notes and a final performance summary are required.",
          });
      }

      const managerScore =
        Number(
          record
            .managerAssessment
            .proposedScore
        );

      const requestedFinalScore =
        req.body.finalScore ===
          undefined ||
        req.body.finalScore ===
          null ||
        req.body.finalScore ===
          ""
          ? managerScore
          : Number(
              req.body.finalScore
            );

      if (
        !isValidScore(
          requestedFinalScore
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "A valid final performance score between 1 and 5 is required.",
          });
      }

      const normalizedFinalScore =
        Number(
          requestedFinalScore
            .toFixed(2)
        );

      const finalRating =
        getRatingFromScore(
          normalizedFinalScore
        );

      const scoreWasOverridden =
        Number.isFinite(
          managerScore
        ) &&
        Number(
          managerScore.toFixed(2)
        ) !==
          normalizedFinalScore;

      const overrideReason =
        normalizeString(
          req.body.overrideReason
        );

      if (
        scoreWasOverridden &&
        !overrideReason
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "HR must provide an override reason when the final score differs from the manager score.",
          });
      }

      const improvementRequired =
        requiresImprovementPlan(
          finalRating
        );

      let improvementPlan = {
        required: false,
        status:
          "Not Required",

        planNumber: "",
        reason: "",

        expectedImprovement:
          "",

        supportProvided: "",
        startDate: "",
        reviewDate: "",
        completionDate: "",
        outcomeNotes: "",
        createdBy: "",
        createdByUserId: "",
        createdAt: null,
        completedBy: "",
        completedByUserId: "",
        completedAt: null,
      };

      if (improvementRequired) {
        const planInput =
          req.body
            .improvementPlan ||
          {};

        const reason =
          normalizeString(
            planInput.reason
          );

        const expectedImprovement =
          normalizeString(
            planInput
              .expectedImprovement
          );

        const supportProvided =
          normalizeString(
            planInput
              .supportProvided
          );

        const startDate =
          normalizeString(
            planInput.startDate
          );

        const reviewDate =
          normalizeString(
            planInput.reviewDate
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
                "A Needs Improvement or Unsatisfactory rating requires an improvement-plan reason, expected improvement, support, start date and review date.",
            });
        }

        if (
          !isValidYmdDate(
            startDate
          ) ||
          !isValidYmdDate(
            reviewDate
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Improvement-plan dates must use valid YYYY-MM-DD values.",
            });
        }

        if (
          reviewDate <
          startDate
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Improvement-plan review date cannot be earlier than its start date.",
            });
        }

        improvementPlan = {
          required: true,
          status: "Draft",

          planNumber:
            createImprovementPlanNumber(
              record.reviewNumber
            ),

          reason,
          expectedImprovement,
          supportProvided,
          startDate,
          reviewDate,
          completionDate: "",
          outcomeNotes: "",

          createdBy:
            getUserName(
              req.user
            ),

          createdByUserId:
            getUserId(
              req.user
            ),

          createdAt:
            new Date(),

          completedBy: "",
          completedByUserId: "",
          completedAt: null,
        };
      }

      const reviewedAt =
        new Date();

      const fromStatus =
        record.status;

      record.hrReview = {
        status: "Approved",

        reviewedBy:
          getUserName(req.user),

        reviewedByUserId:
          getUserId(req.user),

        reviewedAt,

        notes:
          hrNotes,

        returnReason: "",
      };

      record.finalScore =
        normalizedFinalScore;

      record.finalRating =
        finalRating;

      record.finalSummary =
        finalSummary;

      if (
        req.body
          .developmentActions !==
        undefined
      ) {
        record.developmentActions =
          normalizeString(
            req.body
              .developmentActions
          );
      }

      record.improvementPlan =
        improvementPlan;

      let toStatus =
        "Awaiting Acknowledgement";

      if (
        !record
          .acknowledgementRequired
      ) {
        if (
          improvementRequired
        ) {
          toStatus =
            "Improvement Plan";
        } else {
          toStatus =
            "Completed";

          record.completedAt =
            reviewedAt;
        }
      }

      record.status =
        toStatus;

      record
        .employeeAcknowledgement
        .status =
        record
          .acknowledgementRequired
          ? "Pending"
          : "Not Required";

      record.updatedBy =
        getUserName(req.user);

      record.history.push({
        action:
          "HR Review Approved",

        fromStatus,

        toStatus,

        notes:
          scoreWasOverridden
            ? `${hrNotes} Score override: ${overrideReason}`
            : hrNotes,

        performedBy:
          getUserName(req.user),

        performedByUserId:
          getUserId(req.user),

        performedAt:
          reviewedAt,
      });

      await record.save();

      await writeAuditLog({
        req,

        action:
          "Performance Review HR Approved",

        module: "HR",

        description:
          `${record.reviewNumber} was approved by HR with a final ${finalRating} rating.`,

        targetType:
          "PerformanceReview",

        targetId:
          record.reviewNumber,

        metadata: {
          employeeId:
            record.employeeId,

          managerEmployeeId:
            record
              .managerEmployeeId,

          cycleCode:
            record.cycleCode,

          finalScore:
            normalizedFinalScore,

          finalRating,

          scoreWasOverridden,

          overrideReason,

          improvementPlanRequired:
            improvementRequired,

          improvementPlanNumber:
            improvementPlan
              .planNumber,
        },

        beforeValues: {
          status:
            fromStatus,

          hrReviewStatus:
            "Pending",

          finalScore: null,

          finalRating:
            "Not Rated",
        },

        afterValues: {
          status:
            record.status,

          hrReviewStatus:
            record
              .hrReview
              .status,

          finalScore:
            record.finalScore,

          finalRating:
            record.finalRating,

          improvementPlanStatus:
            record
              .improvementPlan
              .status,
        },
      });

      return res.json({
        success: true,

        message:
          improvementRequired
            ? "Performance review approved successfully. Employee acknowledgement and a controlled improvement plan are required."
            : "Performance review approved successfully.",

        data: record,
      });
    } catch (error) {
      return sendHrReviewError(
        res,
        error,
        "Failed to complete the controlled HR performance review."
      );
    }
  };

module.exports = {
  returnManagerAssessment,
  approvePerformanceReviewByHr,
};