const EmployeeLifecycleCase = require(
  "../models/EmployeeLifecycleCase"
);

const PerformanceReview = require(
  "../models/PerformanceReview"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const ACTIVE_COORDINATION_STATUSES = [
  "Pending",
  "In Progress",
  "Review Due",
];

const PROBATION_OUTCOMES = [
  "Passed",
  "Extended",
  "Failed",
];

const CLOSED_CASE_STATUSES = [
  "Completed",
  "Cancelled",
];

const OUTCOME_ALLOWED_CASE_STATUSES = [
  "Approved",
  "In Progress",
  "Blocked",
  "Ready for Completion",
];

const YMD_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

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
      user?.email
  ) || "Authenticated User";

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

const validateDateField = (
  value,
  label
) => {
  if (!normalizeString(value)) {
    return `${label} is required.`;
  }

  if (!isValidYmdDate(value)) {
    return `${label} must use YYYY-MM-DD.`;
  }

  return "";
};

const getLifecycleCase = async (
  lifecycleCaseNumber
) =>
  EmployeeLifecycleCase.findOne({
    lifecycleCaseNumber:
      normalizeString(
        lifecycleCaseNumber
      ).toUpperCase(),
  });

const validateOnboardingCase = (
  lifecycleCase,
  res
) => {
  if (!lifecycleCase) {
    res.status(404).json({
      success: false,
      message:
        "Controlled employee lifecycle case not found.",
    });

    return false;
  }

  if (
    lifecycleCase.caseType !==
    "Onboarding"
  ) {
    res.status(409).json({
      success: false,
      message:
        "Probation coordination is available only for onboarding cases.",
    });

    return false;
  }

  if (
    CLOSED_CASE_STATUSES.includes(
      lifecycleCase.status
    )
  ) {
    res.status(409).json({
      success: false,
      message:
        `${lifecycleCase.lifecycleCaseNumber} is ${lifecycleCase.status} and cannot receive probation updates.`,
    });

    return false;
  }

  return true;
};

const validatePerformanceReview = async ({
  performanceReviewNumber,
  employeeId,
}) => {
  const normalizedReviewNumber =
    normalizeString(
      performanceReviewNumber
    ).toUpperCase();

  if (!normalizedReviewNumber) {
    return {
      review: null,
      error: "",
    };
  }

  const review =
    await PerformanceReview.findOne({
      reviewNumber:
        normalizedReviewNumber,
    });

  if (!review) {
    return {
      review: null,
      error:
        "The referenced controlled performance review was not found.",
    };
  }

  if (
    normalizeString(
      review.employeeId
    ).toUpperCase() !==
    normalizeString(
      employeeId
    ).toUpperCase()
  ) {
    return {
      review: null,
      error:
        "The referenced performance review belongs to a different employee.",
    };
  }

  if (
    review.reviewType !==
    "Probation"
  ) {
    return {
      review: null,
      error:
        "The linked performance review must use the Probation review type.",
    };
  }

  if (
    review.status ===
    "Cancelled"
  ) {
    return {
      review: null,
      error:
        "A cancelled performance review cannot be linked to probation coordination.",
    };
  }

  return {
    review,
    error: "",
  };
};

const updateProbationCoordination =
  async (req, res) => {
    try {
      const {
        lifecycleCaseNumber,
      } = req.params;

      const required =
        req.body?.required;

      const status =
        normalizeString(
          req.body?.status
        );

      const startDate =
        normalizeString(
          req.body?.startDate
        );

      const expectedEndDate =
        normalizeString(
          req.body?.expectedEndDate
        );

      const reviewDate =
        normalizeString(
          req.body?.reviewDate
        );

      const performanceReviewNumber =
        normalizeString(
          req.body
            ?.performanceReviewNumber
        ).toUpperCase();

      const notes =
        normalizeString(
          req.body?.notes
        );

      if (
        typeof required !==
        "boolean"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Probation required must be true or false.",
        });
      }

      if (!required) {
        if (!notes) {
          return res.status(400).json({
            success: false,
            message:
              "Probation exclusion notes are required when probation is not applicable.",
          });
        }
      } else {
        if (
          !ACTIVE_COORDINATION_STATUSES.includes(
            status
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Active probation status must be Pending, In Progress or Review Due.",
          });
        }

        const dateErrors = [
          validateDateField(
            startDate,
            "Probation start date"
          ),

          validateDateField(
            expectedEndDate,
            "Probation expected end date"
          ),

          validateDateField(
            reviewDate,
            "Probation review date"
          ),
        ].filter(Boolean);

        if (dateErrors.length > 0) {
          return res.status(400).json({
            success: false,
            message:
              dateErrors[0],
          });
        }

        if (
          expectedEndDate <
          startDate
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Probation expected end date cannot be before the start date.",
          });
        }

        if (
          reviewDate <
          startDate
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Probation review date cannot be before the start date.",
          });
        }

        if (!notes) {
          return res.status(400).json({
            success: false,
            message:
              "Probation coordination notes are required.",
          });
        }
      }

      const lifecycleCase =
        await getLifecycleCase(
          lifecycleCaseNumber
        );

      if (
        !validateOnboardingCase(
          lifecycleCase,
          res
        )
      ) {
        return;
      }

      let linkedReview = null;

      if (
        required &&
        performanceReviewNumber
      ) {
        const reviewValidation =
          await validatePerformanceReview({
            performanceReviewNumber,
            employeeId:
              lifecycleCase.employeeId,
          });

        if (
          reviewValidation.error
        ) {
          return res.status(409).json({
            success: false,
            message:
              reviewValidation.error,
          });
        }

        linkedReview =
          reviewValidation.review;
      }

      const actorName =
        getUserName(req.user);

      const actorUserId =
        getUserId(req.user);

      const beforeValues =
        lifecycleCase
          .probationCoordination
          .toObject();

      if (!required) {
        lifecycleCase.probationCoordination =
          {
            required: false,
            status:
              "Not Applicable",
            startDate: "",
            expectedEndDate: "",
            reviewDate: "",
            performanceReviewNumber:
              "",
            outcome: "",
            extensionEndDate: "",
            reviewedBy: "",
            reviewedByUserId: "",
            reviewedAt: null,
            notes,
          };
      } else {
        lifecycleCase
          .probationCoordination
          .required = true;

        lifecycleCase
          .probationCoordination
          .status = status;

        lifecycleCase
          .probationCoordination
          .startDate = startDate;

        lifecycleCase
          .probationCoordination
          .expectedEndDate =
          expectedEndDate;

        lifecycleCase
          .probationCoordination
          .reviewDate =
          reviewDate;

        lifecycleCase
          .probationCoordination
          .performanceReviewNumber =
          performanceReviewNumber;

        lifecycleCase
          .probationCoordination
          .outcome = "";

        lifecycleCase
          .probationCoordination
          .extensionEndDate = "";

        lifecycleCase
          .probationCoordination
          .reviewedBy = "";

        lifecycleCase
          .probationCoordination
          .reviewedByUserId = "";

        lifecycleCase
          .probationCoordination
          .reviewedAt = null;

        lifecycleCase
          .probationCoordination
          .notes = notes;
      }

      lifecycleCase.updatedBy =
        actorName;

      lifecycleCase.workflowHistory.push({
        action:
          required
            ? "Probation Coordination Updated"
            : "Probation Marked Not Applicable",

        fromStatus:
          lifecycleCase.status,

        toStatus:
          lifecycleCase.status,

        notes,

        performedBy:
          actorName,

        performedByUserId:
          actorUserId,

        performedAt:
          new Date(),
      });

      await lifecycleCase.save();

      const afterValues =
        lifecycleCase
          .probationCoordination
          .toObject();

      await writeAuditLog({
        req,

        action:
          required
            ? "Lifecycle Probation Updated"
            : "Lifecycle Probation Excluded",

        module:
          "HR Employee Lifecycle",

        description:
          required
            ? `Probation coordination was updated for ${lifecycleCase.lifecycleCaseNumber}.`
            : `Probation was marked not applicable for ${lifecycleCase.lifecycleCaseNumber}.`,

        targetType:
          "EmployeeLifecycleCase",

        targetId:
          lifecycleCase
            .lifecycleCaseNumber,

        metadata: {
          lifecycleCaseNumber:
            lifecycleCase
              .lifecycleCaseNumber,

          employeeId:
            lifecycleCase.employeeId,

          probationRequired:
            required,

          probationStatus:
            lifecycleCase
              .probationCoordination
              .status,

          performanceReviewNumber:
            linkedReview
              ?.reviewNumber ||
            "",
        },

        beforeValues,
        afterValues,
      });

      return res.json({
        success: true,

        message:
          required
            ? "Probation coordination updated successfully."
            : "Probation marked not applicable successfully.",

        data: {
          lifecycleCaseNumber:
            lifecycleCase
              .lifecycleCaseNumber,

          employeeId:
            lifecycleCase.employeeId,

          caseStatus:
            lifecycleCase.status,

          probationCoordination:
            lifecycleCase
              .probationCoordination,
        },
      });
    } catch (error) {
      console.error(
        "Update lifecycle probation error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update probation coordination.",
        error:
          error.message,
      });
    }
  };

const recordProbationOutcome =
  async (req, res) => {
    try {
      const {
        lifecycleCaseNumber,
      } = req.params;

      const outcome =
        normalizeString(
          req.body?.outcome
        );

      const extensionEndDate =
        normalizeString(
          req.body?.extensionEndDate
        );

      const performanceReviewNumber =
        normalizeString(
          req.body
            ?.performanceReviewNumber
        ).toUpperCase();

      const notes =
        normalizeString(
          req.body?.notes
        );

      if (
        !PROBATION_OUTCOMES.includes(
          outcome
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Probation outcome must be Passed, Extended or Failed.",
        });
      }

      if (!notes) {
        return res.status(400).json({
          success: false,
          message:
            "Probation outcome notes are required.",
        });
      }

      if (
        outcome ===
        "Extended"
      ) {
        const dateError =
          validateDateField(
            extensionEndDate,
            "Probation extension end date"
          );

        if (dateError) {
          return res.status(400).json({
            success: false,
            message:
              dateError,
          });
        }
      }

      const lifecycleCase =
        await getLifecycleCase(
          lifecycleCaseNumber
        );

      if (
        !validateOnboardingCase(
          lifecycleCase,
          res
        )
      ) {
        return;
      }

      if (
        !OUTCOME_ALLOWED_CASE_STATUSES.includes(
          lifecycleCase.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Probation outcomes may be recorded only after the onboarding case has been approved.",
        });
      }

      if (
        !lifecycleCase
          .probationCoordination
          .required
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This onboarding case does not require probation coordination.",
        });
      }

      if (
        [
          "Passed",
          "Failed",
        ].includes(
          lifecycleCase
            .probationCoordination
            .status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `Probation has already been recorded as ${lifecycleCase.probationCoordination.status}.`,
        });
      }

      const linkedReviewNumber =
        performanceReviewNumber ||
        normalizeString(
          lifecycleCase
            .probationCoordination
            .performanceReviewNumber
        ).toUpperCase();

      if (linkedReviewNumber) {
        const reviewValidation =
          await validatePerformanceReview({
            performanceReviewNumber:
              linkedReviewNumber,

            employeeId:
              lifecycleCase.employeeId,
          });

        if (
          reviewValidation.error
        ) {
          return res.status(409).json({
            success: false,
            message:
              reviewValidation.error,
          });
        }
      }

      if (
        outcome ===
          "Extended" &&
        lifecycleCase
          .probationCoordination
          .expectedEndDate &&
        extensionEndDate <=
          lifecycleCase
            .probationCoordination
            .expectedEndDate
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Probation extension end date must be after the current expected end date.",
        });
      }

      const actorName =
        getUserName(req.user);

      const actorUserId =
        getUserId(req.user);

      const reviewedAt =
        new Date();

      const beforeValues =
        lifecycleCase
          .probationCoordination
          .toObject();

      lifecycleCase
        .probationCoordination
        .status = outcome;

      lifecycleCase
        .probationCoordination
        .outcome = outcome;

      lifecycleCase
        .probationCoordination
        .extensionEndDate =
        outcome === "Extended"
          ? extensionEndDate
          : "";

      lifecycleCase
        .probationCoordination
        .performanceReviewNumber =
        linkedReviewNumber;

      lifecycleCase
        .probationCoordination
        .reviewedBy =
        actorName;

      lifecycleCase
        .probationCoordination
        .reviewedByUserId =
        actorUserId;

      lifecycleCase
        .probationCoordination
        .reviewedAt =
        reviewedAt;

      lifecycleCase
        .probationCoordination
        .notes = notes;

      lifecycleCase.updatedBy =
        actorName;

      lifecycleCase.workflowHistory.push({
        action:
          `Probation ${outcome}`,

        fromStatus:
          lifecycleCase.status,

        toStatus:
          lifecycleCase.status,

        notes,

        performedBy:
          actorName,

        performedByUserId:
          actorUserId,

        performedAt:
          reviewedAt,
      });

      await lifecycleCase.save();

      const afterValues =
        lifecycleCase
          .probationCoordination
          .toObject();

      await writeAuditLog({
        req,

        action:
          "Lifecycle Probation Outcome Recorded",

        module:
          "HR Employee Lifecycle",

        description:
          `${lifecycleCase.lifecycleCaseNumber} probation was recorded as ${outcome}.`,

        targetType:
          "EmployeeLifecycleCase",

        targetId:
          lifecycleCase
            .lifecycleCaseNumber,

        metadata: {
          lifecycleCaseNumber:
            lifecycleCase
              .lifecycleCaseNumber,

          employeeId:
            lifecycleCase.employeeId,

          probationOutcome:
            outcome,

          extensionEndDate:
            outcome === "Extended"
              ? extensionEndDate
              : "",

          performanceReviewNumber:
            linkedReviewNumber,
        },

        beforeValues,
        afterValues,
      });

      return res.json({
        success: true,

        message:
          `Probation outcome recorded as ${outcome} successfully.`,

        data: {
          lifecycleCaseNumber:
            lifecycleCase
              .lifecycleCaseNumber,

          employeeId:
            lifecycleCase.employeeId,

          caseStatus:
            lifecycleCase.status,

          probationCoordination:
            lifecycleCase
              .probationCoordination,
        },
      });
    } catch (error) {
      console.error(
        "Record lifecycle probation outcome error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to record the probation outcome.",
        error:
          error.message,
      });
    }
  };

module.exports = {
  updateProbationCoordination,
  recordProbationOutcome,
};