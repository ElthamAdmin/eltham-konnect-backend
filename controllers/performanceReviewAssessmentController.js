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

const isReviewEmployee = (
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
        record.employeeId
    ) ||
    (
      userId &&
      userId ===
        record.linkedUserId
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

  if (
    goals.length === 0 ||
    totalWeight <= 0
  ) {
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
            goal.employeeScore ||
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
                .employeeScore ||
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
            .employeeScore ||
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

const sendAssessmentError = (
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

const submitPerformanceSelfAssessment =
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
        !isReviewEmployee(
          record,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "Only the employee assigned to this performance review may submit its self-assessment.",
          });
      }

      if (
        record.status !==
        "Self Assessment"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "A self-assessment can be submitted only while the review is in Self Assessment.",

            data: {
              reviewNumber:
                record.reviewNumber,

              currentStatus:
                record.status,

              allowedStatus:
                "Self Assessment",
            },
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
              "Self-assessment strengths, areas for improvement and overall comments are required.",
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
                `Self-assessment evidence is required for goal ${goalNumber}.`,
            });
        }

        if (
          !isValidScore(
            submittedGoal
              .employeeScore
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `Goal ${goalNumber} requires an employee score between 1 and 5.`,
            });
        }

        const progressComments =
          normalizeString(
            submittedGoal
              .employeeProgressComments
          );

        if (!progressComments) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `Goal ${goalNumber} requires employee progress comments.`,
            });
        }

        goal.employeeScore =
          Number(
            submittedGoal
              .employeeScore
          );

        goal.employeeProgressComments =
          progressComments;

        if (
          submittedGoal.status
        ) {
          goal.status =
            normalizeString(
              submittedGoal.status
            );
        }

        if (
          Array.isArray(
            submittedGoal
              .evidenceReferences
          )
        ) {
          goal.evidenceReferences =
            submittedGoal
              .evidenceReferences
              .map(
                normalizeString
              )
              .filter(Boolean);
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
                `Self-assessment evidence is required for competency ${competencyCode}.`,
            });
        }

        if (
          !isValidScore(
            submittedCompetency
              .employeeScore
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `Competency ${competencyCode} requires an employee score between 1 and 5.`,
            });
        }

        const employeeComments =
          normalizeString(
            submittedCompetency
              .employeeComments
          );

        if (!employeeComments) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `Competency ${competencyCode} requires employee comments.`,
            });
        }

        competency.employeeScore =
          Number(
            submittedCompetency
              .employeeScore
          );

        competency.employeeComments =
          employeeComments;
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
              "The controlled self-assessment score could not be calculated.",
          });
      }

      const submittedAt =
        new Date();

      record.selfAssessment = {
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
        "Manager Assessment";

      record
        .managerAssessment
        .status =
        "Not Started";

      record.updatedBy =
        getUserName(req.user);

      record.history.push({
        action:
          "Self Assessment Submitted",

        fromStatus,

        toStatus:
          "Manager Assessment",

        notes:
          normalizeString(
            req.body
              .submissionNotes
          ) ||
          "Employee self-assessment submitted for manager assessment.",

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
          "Performance Self Assessment Submitted",

        module: "HR",

        description:
          `${record.reviewNumber} employee self-assessment was submitted.`,

        targetType:
          "PerformanceReview",

        targetId:
          record.reviewNumber,

        metadata: {
          employeeId:
            record.employeeId,

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

          selfAssessmentStatus:
            "Not Started",
        },

        afterValues: {
          status:
            record.status,

          selfAssessmentStatus:
            record
              .selfAssessment
              .status,

          proposedScore:
            overallScore,

          proposedRating:
            record
              .selfAssessment
              .proposedRating,
        },
      });

      return res.json({
        success: true,

        message:
          "Performance self-assessment submitted successfully.",

        data: record,
      });
    } catch (error) {
      return sendAssessmentError(
        res,
        error,
        "Failed to submit the controlled performance self-assessment."
      );
    }
  };

module.exports = {
  submitPerformanceSelfAssessment,
};