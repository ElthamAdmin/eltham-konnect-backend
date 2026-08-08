const HREmployee = require("../models/HREmployee");
const PerformanceReview = require(
  "../models/PerformanceReview"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const REVIEW_TYPES = [
  "Annual",
  "Probation",
  "Quarterly",
  "Mid-Year",
  "Project",
  "Improvement Plan",
  "Other",
];

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

const createReviewNumber = () =>
  `PR-${Date.now()}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;

const buildEmployeeSnapshot = (
  employee
) => ({
  fullName:
    employee.fullName,

  jobTitle:
    employee.jobTitle || "",

  department:
    employee.department || "",

  branch:
    employee.branch || "",

  employmentStatus:
    employee.employmentStatus ||
    "",

  reportsToEmployeeId:
    employee.reportsToEmployeeId ||
    "",

  reportsToName:
    employee.reportsToName || "",
});

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
        "Not Started",

      employeeProgressComments:
        "",

      managerProgressComments:
        "",

      employeeScore:
        null,

      managerScore:
        null,

      evidenceReferences: [],
      completedAt: null,
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

      employeeScore: null,
      employeeComments: "",
      managerScore: null,
      managerComments: "",
    })
  );
};

const validateGoals = (
  goals
) => {
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

const canAccessReview = (
  record,
  user
) => {
  if (hasHrAccess(user)) {
    return true;
  }

  const linkedEmployeeId =
    getLinkedEmployeeId(user);

  const userId =
    getUserId(user);

  const isSubject =
    Boolean(
      (
        linkedEmployeeId &&
        linkedEmployeeId ===
          record.employeeId
      ) ||
      (
        userId &&
        userId ===
          record.linkedUserId
      )
    );

  const isManager =
    Boolean(
      (
        linkedEmployeeId &&
        linkedEmployeeId ===
          record
            .managerEmployeeId
      ) ||
      (
        userId &&
        userId ===
          record
            .managerLinkedUserId
      )
    );

  return (
    isSubject ||
    isManager
  );
};

const sendControllerError = (
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

const getPerformanceReviews =
  async (req, res) => {
    try {
      const query = {};

      const employeeId =
        normalizeString(
          req.query.employeeId
        );

      const cycleCode =
        normalizeUpper(
          req.query.cycleCode
        );

      const status =
        normalizeString(
          req.query.status
        );

      const reviewType =
        normalizeString(
          req.query.reviewType
        );

      const managerEmployeeId =
        normalizeString(
          req.query
            .managerEmployeeId
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

      if (reviewType) {
        query.reviewType =
          reviewType;
      }

      if (managerEmployeeId) {
        query.managerEmployeeId =
          managerEmployeeId;
      }

      const records =
        await PerformanceReview
          .find(query)
          .sort({
            periodStartDate: -1,
            createdAt: -1,
          });

      return res.json({
        success: true,

        message:
          "Controlled performance reviews retrieved successfully.",

        totalRecords:
          records.length,

        data: records,
      });
    } catch (error) {
      return sendControllerError(
        res,
        error,
        "Failed to retrieve controlled performance reviews."
      );
    }
  };

const getMyPerformanceReviews =
  async (req, res) => {
    try {
      const linkedEmployeeId =
        getLinkedEmployeeId(
          req.user
        );

      const userId =
        getUserId(req.user);

      if (
        !linkedEmployeeId &&
        !userId
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "Your user account is not linked to an employee profile.",
          });
      }

      const accessConditions = [];

      if (linkedEmployeeId) {
        accessConditions.push(
          {
            employeeId:
              linkedEmployeeId,
          },
          {
            managerEmployeeId:
              linkedEmployeeId,
          }
        );
      }

      if (userId) {
        accessConditions.push(
          {
            linkedUserId:
              userId,
          },
          {
            managerLinkedUserId:
              userId,
          }
        );
      }

      const records =
        await PerformanceReview
          .find({
            $or:
              accessConditions,
          })
          .sort({
            periodStartDate: -1,
            createdAt: -1,
          });

      const data =
        records.map(
          (record) => {
            const object =
              record.toObject();

            const employeeAccess =
              Boolean(
                (
                  linkedEmployeeId &&
                  linkedEmployeeId ===
                    record.employeeId
                ) ||
                (
                  userId &&
                  userId ===
                    record
                      .linkedUserId
                )
              );

            const managerAccess =
              Boolean(
                (
                  linkedEmployeeId &&
                  linkedEmployeeId ===
                    record
                      .managerEmployeeId
                ) ||
                (
                  userId &&
                  userId ===
                    record
                      .managerLinkedUserId
                )
              );

            return {
              ...object,

              accessRole:
                employeeAccess
                  ? "Employee"
                  : managerAccess
                    ? "Manager"
                    : "",
            };
          }
        );

      return res.json({
        success: true,

        message:
          "Your controlled performance reviews were retrieved successfully.",

        totalRecords:
          data.length,

        data,
      });
    } catch (error) {
      return sendControllerError(
        res,
        error,
        "Failed to retrieve your controlled performance reviews."
      );
    }
  };

const getPerformanceReviewByNumber =
  async (req, res) => {
    try {
      const reviewNumber =
        normalizeUpper(
          req.params
            .reviewNumber
        );

      const record =
        await PerformanceReview
          .findOne({
            reviewNumber,
          });

      if (!record) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Controlled performance review not found.",
          });
      }

      if (
        !canAccessReview(
          record,
          req.user
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot access this performance review.",
          });
      }

      return res.json({
        success: true,

        message:
          "Controlled performance review retrieved successfully.",

        data: record,
      });
    } catch (error) {
      return sendControllerError(
        res,
        error,
        "Failed to retrieve the controlled performance review."
      );
    }
  };

const createPerformanceReviewDraft =
  async (req, res) => {
    try {
      const employeeId =
        normalizeString(
          req.body.employeeId
        );

      const cycleCode =
        normalizeUpper(
          req.body.cycleCode
        );

      const cycleName =
        normalizeString(
          req.body.cycleName
        );

      const reviewType =
        normalizeString(
          req.body.reviewType
        );

      const periodStartDate =
        normalizeString(
          req.body
            .periodStartDate
        );

      const periodEndDate =
        normalizeString(
          req.body
            .periodEndDate
        );

      if (
        !employeeId ||
        !cycleCode ||
        !cycleName ||
        !reviewType ||
        !periodStartDate ||
        !periodEndDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Employee, cycle code, cycle name, review type and performance-period dates are required.",
          });
      }

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

      if (
        !isValidYmdDate(
          periodStartDate
        ) ||
        !isValidYmdDate(
          periodEndDate
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Performance-period dates must use valid YYYY-MM-DD values.",
          });
      }

      if (
        periodEndDate <
        periodStartDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Performance period end date cannot be earlier than its start date.",
          });
      }

      const dueDateFields = [
        "goalSettingDueDate",
        "selfAssessmentDueDate",
        "managerAssessmentDueDate",
        "acknowledgementDueDate",
      ];

      for (
        const fieldName of
        dueDateFields
      ) {
        const value =
          normalizeString(
            req.body[fieldName]
          );

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
      }

      const employee =
        await HREmployee
          .findOne({
            employeeId,
          });

      if (!employee) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "HR employee not found.",
          });
      }

      const managerEmployeeId =
        normalizeString(
          req.body
            .managerEmployeeId ||
            employee
              .reportsToEmployeeId
        );

      let manager = null;

      if (managerEmployeeId) {
        manager =
          await HREmployee
            .findOne({
              employeeId:
                managerEmployeeId,
            });

        if (!manager) {
          return res
            .status(404)
            .json({
              success: false,

              message:
                "The assigned performance-review manager was not found.",
            });
        }

        if (
          manager.employeeId ===
          employee.employeeId
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "An employee cannot be assigned as their own performance-review manager.",
            });
        }
      }

      const existingRecord =
        await PerformanceReview
          .findOne({
            employeeId,
            cycleCode,
            reviewType,

            status: {
              $ne: "Cancelled",
            },
          })
          .select(
            "reviewNumber status"
          );

      if (existingRecord) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              "A controlled performance review already exists for this employee, cycle and review type.",

            data: {
              reviewNumber:
                existingRecord
                  .reviewNumber,

              status:
                existingRecord
                  .status,
            },
          });
      }

      const goals =
        normalizeGoals(
          req.body.goals
        );

      const goalError =
        validateGoals(goals);

      if (goalError) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              goalError,
          });
      }

      const competencies =
        normalizeCompetencies(
          req.body.competencies
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

      const actorName =
        getUserName(req.user);

      const actorUserId =
        getUserId(req.user);

      const acknowledgementRequired =
        req.body
          .acknowledgementRequired !==
        false;

      const reviewNumber =
        createReviewNumber();

      const record =
        await PerformanceReview
          .create({
            reviewNumber,
            cycleCode,
            cycleName,
            reviewType,

            employeeId:
              employee.employeeId,

            linkedUserId:
              employee.linkedUserId ||
              "",

            employeeSnapshot:
              buildEmployeeSnapshot(
                employee
              ),

            managerEmployeeId:
              manager
                ?.employeeId || "",

            managerLinkedUserId:
              manager
                ?.linkedUserId || "",

            managerName:
              manager
                ?.fullName ||
              employee
                .reportsToName ||
              "",

            periodStartDate,
            periodEndDate,

            goalSettingDueDate:
              normalizeString(
                req.body
                  .goalSettingDueDate
              ),

            selfAssessmentDueDate:
              normalizeString(
                req.body
                  .selfAssessmentDueDate
              ),

            managerAssessmentDueDate:
              normalizeString(
                req.body
                  .managerAssessmentDueDate
              ),

            acknowledgementDueDate:
              normalizeString(
                req.body
                  .acknowledgementDueDate
              ),

            goals,
            competencies,

            acknowledgementRequired,

            employeeAcknowledgement: {
              status:
                acknowledgementRequired
                  ? "Pending"
                  : "Not Required",
            },

            status: "Draft",

            sourceType:
              "Controlled Workflow",

            sourceReference:
              reviewNumber,

            history: [
              {
                action:
                  "Draft Created",

                fromStatus: "",

                toStatus:
                  "Draft",

                notes:
                  "Controlled performance-review draft created.",

                performedBy:
                  actorName,

                performedByUserId:
                  actorUserId,

                performedAt:
                  new Date(),
              },
            ],

            createdBy:
              actorName,

            createdByUserId:
              actorUserId,

            updatedBy:
              actorName,
          });

      await writeAuditLog({
        req,

        action:
          "Performance Review Draft Created",

        module: "HR",

        description:
          `${reviewNumber} was created for ${employee.fullName}.`,

        targetType:
          "PerformanceReview",

        targetId:
          reviewNumber,

        metadata: {
          employeeId:
            employee.employeeId,

          cycleCode,
          reviewType,

          managerEmployeeId:
            manager
              ?.employeeId || "",

          goalCount:
            goals.length,

          competencyCount:
            competencies.length,
        },

        afterValues: {
          status: "Draft",
          periodStartDate,
          periodEndDate,
        },
      });

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Controlled performance-review draft created successfully.",

          data: record,
        });
    } catch (error) {
      return sendControllerError(
        res,
        error,
        "Failed to create the controlled performance-review draft."
      );
    }
  };

module.exports = {
  getPerformanceReviews,
  getMyPerformanceReviews,
  getPerformanceReviewByNumber,
  createPerformanceReviewDraft,
};