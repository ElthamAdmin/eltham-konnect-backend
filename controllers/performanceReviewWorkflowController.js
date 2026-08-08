const PerformanceReview = require(
  "../models/PerformanceReview"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const REVIEW_TYPES = [
  "Annual",
  "Probation",
  "Quarterly",
  "Mid-Year",
  "Project",
  "Improvement Plan",
  "Other",
];

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

const hasHrAccess = (user) => {
  if (!user) {
    return false;
  }

  if (user.role === "Admin") {
    return true;
  }

  const permissions =
    Array.isArray(
      user.permissions
    )
      ? user.permissions
      : [];

  return permissions.includes("hr");
};

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

const normalizeGoals = (
  goals = []
) => {
  if (!Array.isArray(goals)) {
    return [];
  }

  return goals.map(
    (
      goal,
      index
    ) => ({
      goalNumber:
        normalizeUpper(
          goal?.goalNumber
        ) ||
        `GOAL-${String(
          index + 1
        ).padStart(3, "0")}`,

      title:
        normalizeString(
          goal?.title
        ),

      description:
        normalizeString(
          goal?.description
        ),

      successMeasure:
        normalizeString(
          goal?.successMeasure
        ),

      weightPercentage:
        Number(
          goal?.weightPercentage ||
            0
        ),

      targetDate:
        normalizeString(
          goal?.targetDate
        ),

      status:
        normalizeString(
          goal?.status
        ) ||
        "Not Started",

      employeeProgressComments:
        normalizeString(
          goal
            ?.employeeProgressComments
        ),

      managerProgressComments:
        normalizeString(
          goal
            ?.managerProgressComments
        ),

      employeeScore:
        goal?.employeeScore ===
          null ||
        goal?.employeeScore ===
          undefined ||
        goal?.employeeScore === ""
          ? null
          : Number(
              goal.employeeScore
            ),

      managerScore:
        goal?.managerScore ===
          null ||
        goal?.managerScore ===
          undefined ||
        goal?.managerScore === ""
          ? null
          : Number(
              goal.managerScore
            ),

      evidenceReferences:
        Array.isArray(
          goal
            ?.evidenceReferences
        )
          ? goal
              .evidenceReferences
              .map(
                normalizeString
              )
              .filter(Boolean)
          : [],

      completedAt:
        goal?.completedAt ||
        null,
    })
  );
};

const normalizeCompetencies = (
  competencies = []
) => {
  if (
    !Array.isArray(
      competencies
    )
  ) {
    return [];
  }

  return competencies.map(
    (
      competency,
      index
    ) => ({
      competencyCode:
        normalizeUpper(
          competency
            ?.competencyCode
        ) ||
        `COMP-${String(
          index + 1
        ).padStart(3, "0")}`,

      competencyName:
        normalizeString(
          competency
            ?.competencyName
        ),

      description:
        normalizeString(
          competency
            ?.description
        ),

      weightPercentage:
        Number(
          competency
            ?.weightPercentage ||
            0
        ),

      employeeScore:
        competency
          ?.employeeScore ===
          null ||
        competency
          ?.employeeScore ===
          undefined ||
        competency
          ?.employeeScore ===
          ""
          ? null
          : Number(
              competency
                .employeeScore
            ),

      employeeComments:
        normalizeString(
          competency
            ?.employeeComments
        ),

      managerScore:
        competency
          ?.managerScore ===
          null ||
        competency
          ?.managerScore ===
          undefined ||
        competency
          ?.managerScore ===
          ""
          ? null
          : Number(
              competency
                .managerScore
            ),

      managerComments:
        normalizeString(
          competency
            ?.managerComments
        ),
    })
  );
};

const validateGoals = (
  goals,
  requireFullWeight = false
) => {
  if (
    requireFullWeight &&
    goals.length === 0
  ) {
    return (
      "At least one controlled performance goal is required before goal setting can be submitted."
    );
  }

  const goalNumbers =
    goals.map(
      (goal) =>
        normalizeUpper(
          goal.goalNumber
        )
    );

  if (
    new Set(goalNumbers).size !==
    goalNumbers.length
  ) {
    return (
      "Performance goals cannot contain duplicate goal numbers."
    );
  }

  for (const goal of goals) {
    if (
      !goal.title ||
      !goal.description ||
      !goal.successMeasure
    ) {
      return (
        "Each performance goal requires a title, description and success measure."
      );
    }

    if (
      !Number.isFinite(
        goal.weightPercentage
      ) ||
      goal.weightPercentage < 0 ||
      goal.weightPercentage > 100
    ) {
      return (
        "Each performance-goal weight must be between 0 and 100 percent."
      );
    }

    if (
      goal.targetDate &&
      !isValidYmdDate(
        goal.targetDate
      )
    ) {
      return (
        "Each performance-goal target date must use YYYY-MM-DD."
      );
    }
  }

  const combinedWeight =
    Number(
      goals
        .reduce(
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
        )
        .toFixed(4)
    );

  if (
    requireFullWeight &&
    combinedWeight !== 100
  ) {
    return (
      "Submitted performance goals must have a combined weight of exactly 100 percent."
    );
  }

  if (combinedWeight > 100) {
    return (
      "The combined performance-goal weight cannot exceed 100 percent."
    );
  }

  return "";
};

const validateCompetencies = (
  competencies
) => {
  const competencyCodes =
    competencies.map(
      (competency) =>
        normalizeUpper(
          competency
            .competencyCode
        )
    );

  if (
    new Set(
      competencyCodes
    ).size !==
    competencyCodes.length
  ) {
    return (
      "Performance competencies cannot contain duplicate competency codes."
    );
  }

  for (
    const competency of
    competencies
  ) {
    if (
      !competency
        .competencyName
    ) {
      return (
        "Each performance competency requires a name."
      );
    }

    if (
      !Number.isFinite(
        competency
          .weightPercentage
      ) ||
      competency
        .weightPercentage < 0 ||
      competency
        .weightPercentage > 100
    ) {
      return (
        "Each competency weight must be between 0 and 100 percent."
      );
    }
  }

  return "";
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

const writeWorkflowAudit =
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
        "PerformanceReview",

      targetId:
        record.reviewNumber,

      metadata: {
        employeeId:
          record.employeeId,

        cycleCode:
          record.cycleCode,

        reviewType:
          record.reviewType,

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

const sendWorkflowError = (
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

  if (
    error?.code === 11000
  ) {
    return res
      .status(409)
      .json({
        success: false,

        message:
          "A conflicting controlled performance-review record already exists.",
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

const updatePerformanceReviewDraft =
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
        "Draft"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "Only a Draft performance review can be edited through the draft endpoint.",

            data: {
              reviewNumber:
                record.reviewNumber,

              currentStatus:
                record.status,

              allowedStatus:
                "Draft",
            },
          });
      }

      const beforeValues = {
        cycleCode:
          record.cycleCode,

        cycleName:
          record.cycleName,

        reviewType:
          record.reviewType,

        periodStartDate:
          record.periodStartDate,

        periodEndDate:
          record.periodEndDate,

        goalCount:
          record.goals.length,

        competencyCount:
          record
            .competencies
            .length,
      };

      if (
        req.body.cycleCode !==
        undefined
      ) {
        const cycleCode =
          normalizeUpper(
            req.body.cycleCode
          );

        if (!cycleCode) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Cycle code cannot be empty.",
            });
        }

        record.cycleCode =
          cycleCode;
      }

      if (
        req.body.cycleName !==
        undefined
      ) {
        const cycleName =
          normalizeString(
            req.body.cycleName
          );

        if (!cycleName) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "Cycle name cannot be empty.",
            });
        }

        record.cycleName =
          cycleName;
      }

      if (
        req.body.reviewType !==
        undefined
      ) {
        const reviewType =
          normalizeString(
            req.body.reviewType
          );

        if (
          !REVIEW_TYPES.includes(
            reviewType
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                "A valid performance-review type is required.",
            });
        }

        record.reviewType =
          reviewType;
      }

      const dateFields = [
        "periodStartDate",
        "periodEndDate",
        "goalSettingDueDate",
        "selfAssessmentDueDate",
        "managerAssessmentDueDate",
        "acknowledgementDueDate",
      ];

      for (
        const fieldName of
        dateFields
      ) {
        if (
          req.body[fieldName] ===
          undefined
        ) {
          continue;
        }

        const value =
          normalizeString(
            req.body[fieldName]
          );

        const isRequiredDate =
          fieldName ===
            "periodStartDate" ||
          fieldName ===
            "periodEndDate";

        if (
          isRequiredDate &&
          !value
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `${fieldName} cannot be empty.`,
            });
        }

        if (
          value &&
          !isValidYmdDate(value)
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `${fieldName} must use a valid YYYY-MM-DD date.`,
            });
        }

        record[fieldName] =
          value;
      }

      if (
        record.periodEndDate <
        record.periodStartDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Performance period end date cannot be earlier than its start date.",
          });
      }

      if (
        req.body.goals !==
        undefined
      ) {
        const goals =
          normalizeGoals(
            req.body.goals
          );

        const goalError =
          validateGoals(
            goals,
            false
          );

        if (goalError) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                goalError,
            });
        }

        record.goals = goals;
      }

      if (
        req.body.competencies !==
        undefined
      ) {
        const competencies =
          normalizeCompetencies(
            req.body
              .competencies
          );

        const competencyError =
          validateCompetencies(
            competencies
          );

        if (competencyError) {
          return res
            .status(400)
            .json({
              success: false,
              message:
                competencyError,
            });
        }

        record.competencies =
          competencies;
      }

      if (
        req.body
          .acknowledgementRequired !==
        undefined
      ) {
        record
          .acknowledgementRequired =
          Boolean(
            req.body
              .acknowledgementRequired
          );

        record
          .employeeAcknowledgement
          .status =
          record
            .acknowledgementRequired
            ? "Pending"
            : "Not Required";
      }

      const duplicate =
        await PerformanceReview
          .findOne({
            _id: {
              $ne:
                record._id,
            },

            employeeId:
              record.employeeId,

            cycleCode:
              record.cycleCode,

            reviewType:
              record.reviewType,

            status: {
              $ne:
                "Cancelled",
            },
          })
          .select(
            "reviewNumber status"
          );

      if (duplicate) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "Another controlled performance review already exists for this employee, cycle and review type.",

            data: {
              reviewNumber:
                duplicate
                  .reviewNumber,

              status:
                duplicate.status,
            },
          });
      }

      record.updatedBy =
        getUserName(req.user);

      addHistory({
        record,

        action:
          "Draft Updated",

        fromStatus:
          "Draft",

        toStatus:
          "Draft",

        notes:
          normalizeString(
            req.body.updateNotes
          ) ||
          "Controlled performance-review draft updated.",

        req,
      });

      await record.save();

      await writeAuditLog({
        req,

        action:
          "Performance Review Draft Updated",

        module: "HR",

        description:
          `${record.reviewNumber} draft was updated.`,

        targetType:
          "PerformanceReview",

        targetId:
          record.reviewNumber,

        metadata: {
          employeeId:
            record.employeeId,

          cycleCode:
            record.cycleCode,
        },

        beforeValues,

        afterValues: {
          cycleCode:
            record.cycleCode,

          cycleName:
            record.cycleName,

          reviewType:
            record.reviewType,

          periodStartDate:
            record.periodStartDate,

          periodEndDate:
            record.periodEndDate,

          goalCount:
            record.goals.length,

          competencyCount:
            record
              .competencies
              .length,
        },
      });

      return res.json({
        success: true,

        message:
          "Controlled performance-review draft updated successfully.",

        data: record,
      });
    } catch (error) {
      return sendWorkflowError(
        res,
        error,
        "Failed to update the controlled performance-review draft."
      );
    }
  };

const startPerformanceGoalSetting =
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
        "Draft"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "Only a Draft performance review can enter goal setting.",

            data: {
              reviewNumber:
                record.reviewNumber,

              currentStatus:
                record.status,

              allowedStatus:
                "Draft",
            },
          });
      }

      if (
        !record
          .managerEmployeeId
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "A performance-review manager must be assigned before goal setting begins.",
          });
      }

      const fromStatus =
        record.status;

      record.status =
        "Goal Setting";

      record.updatedBy =
        getUserName(req.user);

      addHistory({
        record,

        action:
          "Goal Setting Started",

        fromStatus,

        toStatus:
          "Goal Setting",

        notes:
          normalizeString(
            req.body.notes
          ) ||
          "Controlled performance goal setting started.",

        req,
      });

      await record.save();

      await writeWorkflowAudit({
        req,
        record,

        action:
          "Performance Goal Setting Started",

        description:
          `${record.reviewNumber} entered controlled goal setting.`,

        fromStatus,

        toStatus:
          record.status,
      });

      return res.json({
        success: true,

        message:
          "Performance goal setting started successfully.",

        data: record,
      });
    } catch (error) {
      return sendWorkflowError(
        res,
        error,
        "Failed to start controlled performance goal setting."
      );
    }
  };

const submitPerformanceGoals =
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
        "Goal Setting"
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "Performance goals can be submitted only while the review is in Goal Setting.",

            data: {
              reviewNumber:
                record.reviewNumber,

              currentStatus:
                record.status,

              allowedStatus:
                "Goal Setting",
            },
          });
      }

      if (
        !hasHrAccess(
          req.user
        ) &&
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
              "Only HR or the assigned review manager may submit performance goals.",
          });
      }

      if (
        req.body.goals !==
        undefined
      ) {
        record.goals =
          normalizeGoals(
            req.body.goals
          );
      }

      if (
        req.body.competencies !==
        undefined
      ) {
        record.competencies =
          normalizeCompetencies(
            req.body
              .competencies
          );
      }

      const goals =
        Array.from(
          record.goals || []
        );

      const goalError =
        validateGoals(
          goals,
          true
        );

      if (goalError) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              goalError,
          });
      }

      const competencyError =
        validateCompetencies(
          Array.from(
            record
              .competencies || []
          )
        );

      if (competencyError) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              competencyError,
          });
      }

      const fromStatus =
        record.status;

      record.status =
        "Self Assessment";

      record.submittedAt =
        new Date();

      record
        .selfAssessment
        .status =
        "Not Started";

      record.updatedBy =
        getUserName(req.user);

      addHistory({
        record,

        action:
          "Goals Submitted",

        fromStatus,

        toStatus:
          "Self Assessment",

        notes:
          normalizeString(
            req.body
              .submissionNotes
          ) ||
          "Controlled goals approved and submitted for employee self-assessment.",

        req,
      });

      await record.save();

      await writeWorkflowAudit({
        req,
        record,

        action:
          "Performance Goals Submitted",

        description:
          `${record.reviewNumber} goals were submitted for employee self-assessment.`,

        fromStatus,

        toStatus:
          record.status,

        metadata: {
          goalCount:
            record.goals.length,

          totalGoalWeight:
            record.goals.reduce(
              (
                total,
                goal
              ) =>
                total +
                Number(
                  goal
                    .weightPercentage ||
                    0
                ),
              0
            ),

          competencyCount:
            record
              .competencies
              .length,
        },
      });

      return res.json({
        success: true,

        message:
          "Performance goals submitted successfully. Employee self-assessment is now available.",

        data: record,
      });
    } catch (error) {
      return sendWorkflowError(
        res,
        error,
        "Failed to submit the controlled performance goals."
      );
    }
  };

module.exports = {
  updatePerformanceReviewDraft,
  startPerformanceGoalSetting,
  submitPerformanceGoals,
};