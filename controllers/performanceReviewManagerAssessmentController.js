const PerformanceReview = require(
  "../models/PerformanceReview"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

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

const getLinkedEmployeeId = (
  user
) =>
  normalizeString(
    user?.linkedEmployeeId ||
      user?.employeeId
  );

const isAssignedManager = (
  record,
  user
) => {
  const employeeId =
    getLinkedEmployeeId(user);

  const userId =
    getUserId(user);

  return Boolean(
    (
      employeeId &&
      employeeId ===
        record.managerEmployeeId
    ) ||
    (
      userId &&
      userId ===
        record.managerLinkedUserId
    )
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

const calculateWeightedGoalScore = (
  goals
) => {
  if (goals.length === 0) {
    return null;
  }

  const totalWeight =
    goals.reduce(
      (
        total,
        goal
      ) =>
        total +
        Number(
          goal.weightPercentage ||
            0
        ),
      0
    );

  if (totalWeight <= 0) {
    return null;
  }

  const weightedTotal =
    goals.reduce(
      (
        total,
        goal
      ) =>
        total +
        (
          Number(
            goal.managerScore ||
              0
          ) *
          Number(
            goal.weightPercentage ||
              0
          )
        ),
      0
    );

  return Number(
    (
      weightedTotal /
      totalWeight
    ).toFixed(2)
  );
};

const calculateCompetencyScore = (
  competencies
) => {
  if (
    competencies.length === 0
  ) {
    return null;
  }

  const totalWeight =
    competencies.reduce(
      (
        total,
        competency
      ) =>
        total +
        Number(
          competency
            .weightPercentage ||
            0
        ),
      0
    );

  if (totalWeight > 0) {
    const weightedTotal =
      competencies.reduce(
        (
          total,
          competency
        ) =>
          total +
          (
            Number(
              competency
                .managerScore ||
                0
            ) *
            Number(
              competency
                .weightPercentage ||
                0
            )
          ),
        0
      );

    return Number(
      (
        weightedTotal /
        totalWeight
      ).toFixed(2)
    );
  }

  const scoreTotal =
    competencies.reduce(
      (
        total,
        competency
      ) =>
        total +
        Number(
          competency
            .managerScore ||
            0
        ),
      0
    );

  return Number(
    (
      scoreTotal /
      competencies.length
    ).toFixed(2)
  );
};

const calculateOverallScore = ({
  goalScore,
  competencyScore,
}) => {
  const availableScores = [
    goalScore,
    competencyScore,
  ].filter(
    (score) =>
      score !== null &&
      score !== undefined
  );

  if (
    availableScores.length === 0
  ) {
    return null;
  }

  return Number(
    (
      availableScores.reduce(
        (
          total,
          score
        ) =>
          total +
          Number(score),
        0
      ) /
      availableScores.length
    ).toFixed(2)
  );
};

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

const sendManagerAssessmentError = (
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

const returnSelfAssessmentToEmployee =
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
        !isAssignedManager(
          record,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "Only the assigned review manager may return this self-assessment.",
          });
      }

      if (
        record.status !==
          "Manager Assessment" ||
        record
          .selfAssessment
          .status !==
          "Submitted"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "Only a submitted employee self-assessment awaiting manager assessment can be returned.",

            data: {
              reviewNumber:
                record.reviewNumber,

              currentStatus:
                record.status,

              selfAssessmentStatus:
                record
                  .selfAssessment
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
              "A self-assessment return reason is required.",
          });
      }

      const returnedAt =
        new Date();

      const fromStatus =
        record.status;

      record
        .selfAssessment
        .status =
        "Returned";

      record
        .selfAssessment
        .returnedBy =
        getUserName(req.user);

      record
        .selfAssessment
        .returnedAt =
        returnedAt;

      record
        .selfAssessment
        .returnReason =
        returnReason;

      record.status =
        "Self Assessment";

      record.updatedBy =
        getUserName(req.user);

      record.history.push({
        action:
          "Self Assessment Returned",

        fromStatus,

        toStatus:
          "Self Assessment",

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
          "Performance Self Assessment Returned",

        module: "HR",

        description:
          `${record.reviewNumber} self-assessment was returned to the employee.`,

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

          selfAssessmentStatus:
            "Submitted",
        },

        afterValues: {
          status:
            record.status,

          selfAssessmentStatus:
            record
              .selfAssessment
              .status,
        },
      });

      return res.json({
        success: true,

        message:
          "Employee self-assessment returned successfully.",

        data: record,
      });
    } catch (error) {
      return sendManagerAssessmentError(
        res,
        error,
        "Failed to return the employee self-assessment."
      );
    }
  };

const submitPerformanceManagerAssessment =
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
        !isAssignedManager(
          record,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "Only the assigned review manager may submit this manager assessment.",
          });
      }

      if (
        record.status !==
        "Manager Assessment"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "A manager assessment can be submitted only while the review is in Manager Assessment.",

            data: {
              reviewNumber:
                record.reviewNumber,

              currentStatus:
                record.status,

              allowedStatus:
                "Manager Assessment",
            },
          });
      }

      if (
        record
          .selfAssessment
          .status !==
        "Submitted"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "The employee self-assessment must be submitted before manager assessment.",
          });
      }

      const strengths =
        normalizeString(
          req.body.strengths
        );

      const areasForImprovement =
        normalizeString(
          req.body
            .areasForImprovement
        );

      const overallComments =
        normalizeString(
          req.body
            .overallComments
        );

      if (
        !strengths ||
        !areasForImprovement ||
        !overallComments
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Manager-assessment strengths, areas for improvement and overall comments are required.",
          });
      }

      const submittedGoals =
        Array.isArray(
          req.body.goals
        )
          ? req.body.goals
          : [];

      const submittedGoalMap =
        new Map(
          submittedGoals.map(
            (goal) => [
              normalizeUpper(
                goal?.goalNumber
              ),
              goal,
            ]
          )
        );

      for (
        const goal of
        record.goals
      ) {
        const goalNumber =
          normalizeUpper(
            goal.goalNumber
          );

        const submittedGoal =
          submittedGoalMap.get(
            goalNumber
          );

        if (!submittedGoal) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `Manager assessment is required for goal ${goalNumber}.`,
            });
        }

        if (
          !isValidScore(
            submittedGoal
              .managerScore
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `Goal ${goalNumber} requires a manager score between 1 and 5.`,
            });
        }

        const managerComments =
          normalizeString(
            submittedGoal
              .managerProgressComments
          );

        if (!managerComments) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `Goal ${goalNumber} requires manager comments.`,
            });
        }

        goal.managerScore =
          Number(
            submittedGoal
              .managerScore
          );

        goal.managerProgressComments =
          managerComments;

        if (
          submittedGoal.status
        ) {
          goal.status =
            normalizeString(
              submittedGoal.status
            );
        }
      }

      const submittedCompetencies =
        Array.isArray(
          req.body.competencies
        )
          ? req.body
              .competencies
          : [];

      const submittedCompetencyMap =
        new Map(
          submittedCompetencies.map(
            (competency) => [
              normalizeUpper(
                competency
                  ?.competencyCode
              ),
              competency,
            ]
          )
        );

      for (
        const competency of
        record.competencies
      ) {
        const competencyCode =
          normalizeUpper(
            competency
              .competencyCode
          );

        const submittedCompetency =
          submittedCompetencyMap.get(
            competencyCode
          );

        if (!submittedCompetency) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `Manager assessment is required for competency ${competencyCode}.`,
            });
        }

        if (
          !isValidScore(
            submittedCompetency
              .managerScore
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `Competency ${competencyCode} requires a manager score between 1 and 5.`,
            });
        }

        const managerComments =
          normalizeString(
            submittedCompetency
              .managerComments
          );

        if (!managerComments) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `Competency ${competencyCode} requires manager comments.`,
            });
        }

        competency.managerScore =
          Number(
            submittedCompetency
              .managerScore
          );

        competency.managerComments =
          managerComments;
      }

      const goalScore =
        calculateWeightedGoalScore(
          Array.from(
            record.goals || []
          )
        );

      const competencyScore =
        calculateCompetencyScore(
          Array.from(
            record.competencies ||
              []
          )
        );

      const overallScore =
        calculateOverallScore({
          goalScore,
          competencyScore,
        });

      if (
        !overallScore ||
        !isValidScore(
          overallScore
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "The controlled manager-assessment score could not be calculated.",
          });
      }

      const submittedAt =
        new Date();

      record.managerAssessment = {
        status: "Submitted",
        strengths,
        areasForImprovement,
        overallComments,

        proposedRating:
          getRatingFromScore(
            overallScore
          ),

        proposedScore:
          overallScore,

        submittedBy:
          getUserName(
            req.user
          ),

        submittedByUserId:
          getUserId(
            req.user
          ),

        submittedAt,

        returnedBy: "",
        returnedAt: null,
        returnReason: "",
      };

      const fromStatus =
        record.status;

      record.status =
        "HR Review";

      record.hrReview.status =
        "Pending";

      record.updatedBy =
        getUserName(req.user);

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

      record.history.push({
        action:
          "Manager Assessment Submitted",

        fromStatus,

        toStatus:
          "HR Review",

        notes:
          normalizeString(
            req.body
              .submissionNotes
          ) ||
          "Manager assessment submitted for controlled HR review.",

        performedBy:
          getUserName(req.user),

        performedByUserId:
          getUserId(req.user),

        performedAt:
          submittedAt,
      });

      await record.save();

      await writeAuditLog({
        req,

        action:
          "Performance Manager Assessment Submitted",

        module: "HR",

        description:
          `${record.reviewNumber} manager assessment was submitted for HR review.`,

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

          goalCount:
            record.goals.length,

          competencyCount:
            record
              .competencies
              .length,
        },

        beforeValues: {
          status:
            fromStatus,

          managerAssessmentStatus:
            "Not Started",
        },

        afterValues: {
          status:
            record.status,

          managerAssessmentStatus:
            record
              .managerAssessment
              .status,

          proposedScore:
            overallScore,

          proposedRating:
            record
              .managerAssessment
              .proposedRating,
        },
      });

      return res.json({
        success: true,

        message:
          "Manager assessment submitted successfully for HR review.",

        data: record,
      });
    } catch (error) {
      return sendManagerAssessmentError(
        res,
        error,
        "Failed to submit the controlled manager assessment."
      );
    }
  };

module.exports = {
  returnSelfAssessmentToEmployee,
  submitPerformanceManagerAssessment,
};