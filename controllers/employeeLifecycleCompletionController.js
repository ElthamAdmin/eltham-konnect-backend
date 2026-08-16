const EmployeeLifecycleCase = require(
  "../models/EmployeeLifecycleCase"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const COMPLETABLE_CASE_STATUSES = [
  "In Progress",
  "Ready for Completion",
];

const CLOSED_CASE_STATUSES = [
  "Completed",
  "Cancelled",
];

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

const getLifecycleCase = async (
  lifecycleCaseNumber
) =>
  EmployeeLifecycleCase.findOne({
    lifecycleCaseNumber:
      normalizeString(
        lifecycleCaseNumber
      ).toUpperCase(),
  });

const getRequiredApprovalBlockers = (
  lifecycleCase
) => {
  const blockers = [];

  if (
    lifecycleCase.managerApproval
      ?.required &&
    lifecycleCase.managerApproval
      ?.status !== "Approved"
  ) {
    blockers.push({
      area: "Manager Approval",
      reference: "managerApproval",
      message:
        "Required manager approval has not been completed.",
    });
  }

  if (
    lifecycleCase.hrApproval
      ?.required &&
    lifecycleCase.hrApproval
      ?.status !== "Approved"
  ) {
    blockers.push({
      area: "HR Approval",
      reference: "hrApproval",
      message:
        "Required HR approval has not been completed.",
    });
  }

  return blockers;
};

const getChecklistBlockers = (
  lifecycleCase
) => {
  const blockers = [];

  for (
    const item of
    lifecycleCase.checklistItems || []
  ) {
    if (
      item.required &&
      item.status !== "Completed"
    ) {
      blockers.push({
        area: "Checklist",
        reference:
          item.itemNumber,
        message:
          `${item.title} is required and remains ${item.status}.`,
      });
    } else if (
      item.status === "Blocked"
    ) {
      blockers.push({
        area: "Checklist",
        reference:
          item.itemNumber,
        message:
          `${item.title} remains blocked.`,
      });
    }
  }

  return blockers;
};

const ACCESS_COMPLETION_STATUSES = {
  Create: [
    "Provisioned",
    "Not Applicable",
  ],

  Activate: [
    "Provisioned",
    "Not Applicable",
  ],

  Modify: [
    "Modified",
    "Not Applicable",
  ],

  Review: [
    "Reviewed",
    "Not Applicable",
  ],

  Deactivate: [
    "Deactivated",
    "Not Applicable",
  ],

  Revoke: [
    "Revoked",
    "Not Applicable",
  ],
};

const getAccessBlockers = (
  lifecycleCase
) => {
  const blockers = [];

  for (
    const item of
    lifecycleCase.systemAccessItems ||
    []
  ) {
    const allowedStatuses =
      ACCESS_COMPLETION_STATUSES[
        item.action
      ] || [];

    if (
      !allowedStatuses.includes(
        item.status
      )
    ) {
      blockers.push({
        area: "System Access",
        reference:
          item.accessNumber,
        message:
          `${item.systemName} requires ${item.action} completion and remains ${item.status}.`,
      });
    }
  }

  return blockers;
};

const PROPERTY_COMPLETION_STATUSES = {
  Issue: [
    "Issued",
    "Not Applicable",
  ],

  Return: [
    "Returned",
    "Transferred",
    "Lost",
    "Damaged",
    "Not Applicable",
  ],

  Transfer: [
    "Transferred",
    "Not Applicable",
  ],

  Inspect: [
    "Issued",
    "Returned",
    "Transferred",
    "Lost",
    "Damaged",
    "Not Applicable",
  ],
};

const getPropertyBlockers = (
  lifecycleCase
) => {
  const blockers = [];

  for (
    const item of
    lifecycleCase.propertyItems || []
  ) {
    const allowedStatuses =
      PROPERTY_COMPLETION_STATUSES[
        item.action
      ] || [];

    if (
      !allowedStatuses.includes(
        item.status
      )
    ) {
      blockers.push({
        area: "Property",
        reference:
          item.propertyNumber,
        message:
          `${item.propertyName} requires ${item.action} completion and remains ${item.status}.`,
      });
    }
  }

  return blockers;
};

const getProbationBlockers = (
  lifecycleCase
) => {
  const blockers = [];

  if (
    lifecycleCase.caseType !==
      "Onboarding" ||
    !lifecycleCase
      .probationCoordination
      ?.required
  ) {
    return blockers;
  }

  if (
    ![
      "Passed",
      "Failed",
    ].includes(
      lifecycleCase
        .probationCoordination
        ?.status
    )
  ) {
    blockers.push({
      area: "Probation",
      reference:
        lifecycleCase
          .probationCoordination
          ?.performanceReviewNumber ||
        "probationCoordination",

      message:
        `Required probation coordination remains ${lifecycleCase.probationCoordination?.status || "Pending"}.`,
    });
  }

  if (
    ![
      "Passed",
      "Failed",
    ].includes(
      lifecycleCase
        .probationCoordination
        ?.outcome
    )
  ) {
    blockers.push({
      area: "Probation",
      reference:
        "probationCoordination.outcome",

      message:
        "A final probation outcome has not been recorded.",
    });
  }

  return blockers;
};

const getFinalPayrollBlockers = (
  lifecycleCase
) => {
  const blockers = [];

  if (
    lifecycleCase.caseType !==
      "Offboarding" ||
    !lifecycleCase.finalPayroll
      ?.required
  ) {
    return blockers;
  }

  if (
    lifecycleCase.finalPayroll
      ?.status !== "Paid"
  ) {
    blockers.push({
      area: "Final Payroll",
      reference:
        lifecycleCase.finalPayroll
          ?.payrollNumber ||
        "finalPayroll",

      message:
        `Required final payroll remains ${lifecycleCase.finalPayroll?.status || "Pending Review"}.`,
    });
  }

  if (
    !normalizeString(
      lifecycleCase.finalPayroll
        ?.payrollNumber
    )
  ) {
    blockers.push({
      area: "Final Payroll",
      reference:
        "finalPayroll.payrollNumber",

      message:
        "The paid final-payroll record has not been linked.",
    });
  }

  return blockers;
};

const assessCompletionReadiness = (
  lifecycleCase,
  proposedActualEffectiveDate = ""
) => {
  const blockers = [
    ...getRequiredApprovalBlockers(
      lifecycleCase
    ),

    ...getChecklistBlockers(
      lifecycleCase
    ),

    ...getAccessBlockers(
      lifecycleCase
    ),

    ...getPropertyBlockers(
      lifecycleCase
    ),

    ...getProbationBlockers(
      lifecycleCase
    ),

    ...getFinalPayrollBlockers(
      lifecycleCase
    ),
  ];

  if (
    !normalizeString(
      proposedActualEffectiveDate ||
        lifecycleCase
          .actualEffectiveDate
    )
  ) {
    blockers.push({
      area: "Effective Date",
      reference:
        "actualEffectiveDate",

      message:
        "An actual lifecycle effective date is required before completion.",
    });
  }

  if (
    lifecycleCase.status ===
    "Blocked"
  ) {
    blockers.push({
      area: "Case Status",
      reference:
        lifecycleCase
          .lifecycleCaseNumber,

      message:
        "The lifecycle case is blocked and must be resolved before completion.",
    });
  }

  if (
    !COMPLETABLE_CASE_STATUSES.includes(
      lifecycleCase.status
    )
  ) {
    blockers.push({
      area: "Case Status",
      reference:
        lifecycleCase
          .lifecycleCaseNumber,

      message:
        `A lifecycle case must be In Progress or Ready for Completion. Current status: ${lifecycleCase.status}.`,
    });
  }

  return {
    ready:
      blockers.length === 0,

    blockerCount:
      blockers.length,

    blockers,
  };
};

const previewEmployeeLifecycleCompletion =
  async (req, res) => {
    try {
      const {
        lifecycleCaseNumber,
      } = req.params;

      const lifecycleCase =
        await getLifecycleCase(
          lifecycleCaseNumber
        );

      if (!lifecycleCase) {
        return res.status(404).json({
          success: false,
          message:
            "Controlled employee lifecycle case not found.",
        });
      }

      const assessment =
        assessCompletionReadiness(
          lifecycleCase
        );

      return res.json({
        success: true,

        message:
          "Employee lifecycle completion assessment generated successfully. No records were changed.",

        data: {
          lifecycleCaseNumber:
            lifecycleCase
              .lifecycleCaseNumber,

          caseType:
            lifecycleCase.caseType,

          employeeId:
            lifecycleCase.employeeId,

          employeeName:
            lifecycleCase
              .employeeSnapshot
              ?.fullName ||
            "",

          status:
            lifecycleCase.status,

          readyForCompletion:
            assessment.ready,

          blockerCount:
            assessment.blockerCount,

          blockers:
            assessment.blockers,

          actualEffectiveDate:
            lifecycleCase
              .actualEffectiveDate,

          completionSummary:
            lifecycleCase
              .completionSummary,
        },
      });
    } catch (error) {
      console.error(
        "Preview lifecycle completion error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to assess employee lifecycle completion readiness.",
        error:
          error.message,
      });
    }
  };

const completeEmployeeLifecycleCase =
  async (req, res) => {
    try {
      const {
        lifecycleCaseNumber,
      } = req.params;

      const actualEffectiveDate =
        normalizeString(
          req.body
            ?.actualEffectiveDate
        );

      const completionSummary =
        normalizeString(
          req.body
            ?.completionSummary
        );

      if (!actualEffectiveDate) {
        return res.status(400).json({
          success: false,
          message:
            "An actual lifecycle effective date is required.",
        });
      }

      if (!completionSummary) {
        return res.status(400).json({
          success: false,
          message:
            "A lifecycle completion summary is required.",
        });
      }

      const lifecycleCase =
        await getLifecycleCase(
          lifecycleCaseNumber
        );

      if (!lifecycleCase) {
        return res.status(404).json({
          success: false,
          message:
            "Controlled employee lifecycle case not found.",
        });
      }

      if (
        CLOSED_CASE_STATUSES.includes(
          lifecycleCase.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${lifecycleCase.lifecycleCaseNumber} is already ${lifecycleCase.status}.`,
        });
      }

      const assessment =
        assessCompletionReadiness(
          lifecycleCase,
          actualEffectiveDate
        );

      if (!assessment.ready) {
        return res.status(409).json({
          success: false,

          message:
            `${lifecycleCase.lifecycleCaseNumber} is not ready for completion.`,

          data: {
            lifecycleCaseNumber:
              lifecycleCase
                .lifecycleCaseNumber,

            blockerCount:
              assessment
                .blockerCount,

            blockers:
              assessment
                .blockers,
          },
        });
      }

      const actorName =
        getUserName(req.user);

      const actorUserId =
        getUserId(req.user);

      const completedAt =
        new Date();

      const beforeValues = {
        status:
          lifecycleCase.status,

        actualEffectiveDate:
          lifecycleCase
            .actualEffectiveDate,

        actualStartDate:
          lifecycleCase
            .actualStartDate,

        completionSummary:
          lifecycleCase
            .completionSummary,

        completedAt:
          lifecycleCase
            .completedAt,
      };

      const fromStatus =
        lifecycleCase.status;

      lifecycleCase.status =
        "Completed";

      lifecycleCase
        .actualEffectiveDate =
        actualEffectiveDate;

      if (
        lifecycleCase.caseType ===
          "Onboarding" &&
        !lifecycleCase
          .actualStartDate
      ) {
        lifecycleCase
          .actualStartDate =
          actualEffectiveDate;
      }

      lifecycleCase
        .completionSummary =
        completionSummary;

      lifecycleCase.completedAt =
        completedAt;

      lifecycleCase.blockedReason =
        "";

      lifecycleCase.updatedBy =
        actorName;

      lifecycleCase.workflowHistory.push({
        action:
          "Lifecycle Case Completed",

        fromStatus,

        toStatus:
          "Completed",

        notes:
          completionSummary,

        performedBy:
          actorName,

        performedByUserId:
          actorUserId,

        performedAt:
          completedAt,
      });

      await lifecycleCase.save();

      const afterValues = {
        status:
          lifecycleCase.status,

        actualEffectiveDate:
          lifecycleCase
            .actualEffectiveDate,

        actualStartDate:
          lifecycleCase
            .actualStartDate,

        completionSummary:
          lifecycleCase
            .completionSummary,

        completedAt:
          lifecycleCase
            .completedAt,
      };

      await writeAuditLog({
        req,

        action:
          "Lifecycle Case Completed",

        module:
          "HR Employee Lifecycle",

        description:
          `${lifecycleCase.lifecycleCaseNumber} was completed after all controlled lifecycle obligations passed validation.`,

        targetType:
          "EmployeeLifecycleCase",

        targetId:
          lifecycleCase
            .lifecycleCaseNumber,

        metadata: {
          lifecycleCaseNumber:
            lifecycleCase
              .lifecycleCaseNumber,

          caseType:
            lifecycleCase.caseType,

          employeeId:
            lifecycleCase.employeeId,

          actualEffectiveDate:
            lifecycleCase
              .actualEffectiveDate,

          checklistCount:
            lifecycleCase
              .checklistItems
              .length,

          systemAccessCount:
            lifecycleCase
              .systemAccessItems
              .length,

          propertyCount:
            lifecycleCase
              .propertyItems
              .length,

          probationRequired:
            lifecycleCase
              .probationCoordination
              .required,

          finalPayrollRequired:
            lifecycleCase
              .finalPayroll
              .required,
        },

        beforeValues,
        afterValues,
      });

      return res.json({
        success: true,

        message:
          `${lifecycleCase.lifecycleCaseNumber} completed successfully.`,

        data: {
          lifecycleCaseNumber:
            lifecycleCase
              .lifecycleCaseNumber,

          caseType:
            lifecycleCase.caseType,

          employeeId:
            lifecycleCase.employeeId,

          employeeName:
            lifecycleCase
              .employeeSnapshot
              ?.fullName ||
            "",

          status:
            lifecycleCase.status,

          actualEffectiveDate:
            lifecycleCase
              .actualEffectiveDate,

          actualStartDate:
            lifecycleCase
              .actualStartDate,

          completionSummary:
            lifecycleCase
              .completionSummary,

          completedAt:
            lifecycleCase
              .completedAt,
        },
      });
    } catch (error) {
      console.error(
        "Complete lifecycle case error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to complete the employee lifecycle case.",
        error:
          error.message,
      });
    }
  };

module.exports = {
  previewEmployeeLifecycleCompletion,
  completeEmployeeLifecycleCase,
};