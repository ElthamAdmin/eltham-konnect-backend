const EmployeeLifecycleCase = require(
  "../models/EmployeeLifecycleCase"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

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

const normalizeChecklistStatus = (
  value
) => {
  const normalizedValue = normalizeString(
    value
  ).toLowerCase();

  const statuses = {
    "not started": "Not Started",
    "in progress": "In Progress",
    completed: "Completed",
    blocked: "Blocked",
    "not required": "Not Required",
  };

  return statuses[normalizedValue] || "";
};

const getLifecycleCase = async (
  lifecycleCaseNumber
) =>
  EmployeeLifecycleCase.findOne({
    lifecycleCaseNumber: normalizeString(
      lifecycleCaseNumber
    ).toUpperCase(),
  });

const addWorkflowHistory = ({
  record,
  action,
  fromStatus,
  toStatus,
  performedBy,
  performedByUserId,
  notes,
}) => {
  record.workflowHistory =
    record.workflowHistory || [];

  record.workflowHistory.push({
    action,
    fromStatus,
    toStatus,
    performedBy,
    performedByUserId,
    performedAt: new Date(),
    notes,
  });
};

const calculateLifecycleStatus = (
  checklistItems
) => {
  const requiredItems = (
    checklistItems || []
  ).filter(
    (item) => item.required !== false
  );

  const hasBlockedItem =
    requiredItems.some(
      (item) =>
        item.status === "Blocked"
    );

  if (hasBlockedItem) {
    return "Blocked";
  }

  const allRequiredItemsCompleted =
    requiredItems.length > 0 &&
    requiredItems.every(
      (item) =>
        item.status === "Completed"
    );

  if (allRequiredItemsCompleted) {
    return "Ready for Completion";
  }

  return "In Progress";
};

const startEmployeeLifecycleCase = async (
  req,
  res
) => {
  try {
    const lifecycleCaseNumber =
      normalizeString(
        req.params.lifecycleCaseNumber
      ).toUpperCase();

    const startNotes = normalizeString(
      req.body.startNotes ||
        req.body.notes
    );

    const record = await getLifecycleCase(
      lifecycleCaseNumber
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message:
          "Controlled employee lifecycle case not found.",
      });
    }

    if (record.status !== "Approved") {
      return res.status(409).json({
        success: false,
        message:
          `Only an Approved lifecycle case can be started. ${lifecycleCaseNumber} is currently ${record.status}.`,
        data: {
          lifecycleCaseNumber,
          currentStatus: record.status,
          allowedStatus: "Approved",
        },
      });
    }

    if (
      record.managerApproval?.required &&
      record.managerApproval?.status !==
        "Approved"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Manager approval must be completed before the lifecycle case can start.",
      });
    }

    if (
      record.hrApproval?.required &&
      record.hrApproval?.status !==
        "Approved"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "HR approval must be completed before the lifecycle case can start.",
      });
    }

    if (
      !Array.isArray(record.checklistItems) ||
      record.checklistItems.length === 0
    ) {
      return res.status(409).json({
        success: false,
        message:
          "The lifecycle case cannot start without a controlled checklist.",
      });
    }

    const performedBy = getUserName(
      req.user
    );

    const performedByUserId = getUserId(
      req.user
    );

    const fromStatus = record.status;

    record.status = "In Progress";
    record.updatedBy = performedBy;

    addWorkflowHistory({
      record,
      action: "Case Started",
      fromStatus,
      toStatus: "In Progress",
      performedBy,
      performedByUserId,
      notes:
        startNotes ||
        "Approved lifecycle case moved into controlled checklist processing.",
    });

    await record.save();

    await writeAuditLog({
      req,
      action:
        "Employee Lifecycle Case Started",
      module: "HR",
      description:
        `${lifecycleCaseNumber} entered controlled checklist processing.`,
      targetType:
        "EmployeeLifecycleCase",
      targetId: lifecycleCaseNumber,
      metadata: {
        lifecycleCaseNumber,
        employeeId: record.employeeId,
        caseType: record.caseType,
        checklistItemCount:
          record.checklistItems.length,
      },
      beforeValues: {
        status: fromStatus,
      },
      afterValues: {
        status: record.status,
      },
    });

    return res.json({
      success: true,
      message:
        `${lifecycleCaseNumber} started successfully.`,
      data: record,
    });
  } catch (error) {
    console.error(
      "Start employee lifecycle case error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to start the controlled employee lifecycle case.",
      error: error.message,
    });
  }
};

const updateEmployeeLifecycleChecklistItem =
  async (req, res) => {
    try {
      const lifecycleCaseNumber =
        normalizeString(
          req.params.lifecycleCaseNumber
        ).toUpperCase();

      const itemNumber = normalizeString(
        req.params.itemNumber
      ).toUpperCase();

      const status =
        normalizeChecklistStatus(
          req.body.status
        );

      const notes = normalizeString(
        req.body.notes ||
          req.body.completionNotes
      );

      const blockedReason =
        normalizeString(
          req.body.blockedReason
        );

      const evidenceReferences =
        Array.isArray(
          req.body.evidenceReferences
        )
          ? req.body.evidenceReferences
              .map((reference) =>
                normalizeString(reference)
              )
              .filter(Boolean)
          : [];

      if (!status) {
        return res.status(400).json({
          success: false,
          message:
            "Checklist status must be Not Started, In Progress, Completed, Blocked or Not Required.",
        });
      }

      if (
        status === "Completed" &&
        !notes
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Completion notes are required when completing a checklist item.",
        });
      }

      if (
        status === "Blocked" &&
        !blockedReason
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A blocked reason is required when blocking a checklist item.",
        });
      }

      const record =
        await getLifecycleCase(
          lifecycleCaseNumber
        );

      if (!record) {
        return res.status(404).json({
          success: false,
          message:
            "Controlled employee lifecycle case not found.",
        });
      }

      const allowedCaseStatuses = [
        "In Progress",
        "Blocked",
        "Ready for Completion",
      ];

      if (
        !allowedCaseStatuses.includes(
          record.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `Checklist items cannot be updated while ${lifecycleCaseNumber} is ${record.status}.`,
          data: {
            lifecycleCaseNumber,
            currentStatus: record.status,
            allowedStatuses:
              allowedCaseStatuses,
          },
        });
      }

      const checklistItem = (
        record.checklistItems || []
      ).find(
        (item) =>
          normalizeString(
            item.itemNumber
          ).toUpperCase() === itemNumber
      );

      if (!checklistItem) {
        return res.status(404).json({
          success: false,
          message:
            `Checklist item ${itemNumber} was not found on ${lifecycleCaseNumber}.`,
        });
      }

      if (
        status === "Not Required" &&
        checklistItem.required !== false
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${itemNumber} is required and cannot be marked Not Required.`,
        });
      }

      const performedBy = getUserName(
        req.user
      );

      const performedByUserId =
        getUserId(req.user);

      const previousCaseStatus =
        record.status;

      const previousItemStatus =
        checklistItem.status;

      checklistItem.status = status;

      if (status === "Completed") {
        checklistItem.completedAt =
          new Date();

        checklistItem.completedBy =
          performedBy;

        checklistItem.completedByUserId =
          performedByUserId;

        checklistItem.completionNotes =
          notes;

        checklistItem.blockedReason = "";
      } else {
        checklistItem.completedAt = null;
        checklistItem.completedBy = "";

        checklistItem.completedByUserId =
          "";

        checklistItem.completionNotes =
          notes;

        checklistItem.blockedReason =
          status === "Blocked"
            ? blockedReason
            : "";
      }

      if (
        evidenceReferences.length > 0
      ) {
        checklistItem.evidenceReferences =
          evidenceReferences;
      }

      record.status =
        calculateLifecycleStatus(
          record.checklistItems
        );

      record.updatedBy = performedBy;

      addWorkflowHistory({
        record,
        action:
          "Checklist Item Updated",
        fromStatus:
          previousCaseStatus,
        toStatus: record.status,
        performedBy,
        performedByUserId,
        notes:
          `${itemNumber} changed from ${previousItemStatus} to ${status}.` +
          (notes ? ` ${notes}` : "") +
          (blockedReason
            ? ` Blocked reason: ${blockedReason}`
            : ""),
      });

      await record.save();

      await writeAuditLog({
        req,
        action:
          "Employee Lifecycle Checklist Updated",
        module: "HR",
        description:
          `${itemNumber} on ${lifecycleCaseNumber} was changed from ${previousItemStatus} to ${status}.`,
        targetType:
          "EmployeeLifecycleCase",
        targetId: lifecycleCaseNumber,
        metadata: {
          lifecycleCaseNumber,
          employeeId: record.employeeId,
          caseType: record.caseType,
          itemNumber,
        },
        beforeValues: {
          caseStatus:
            previousCaseStatus,
          checklistStatus:
            previousItemStatus,
        },
        afterValues: {
          caseStatus: record.status,
          checklistStatus: status,
        },
      });

      return res.json({
        success: true,
        message:
          `${itemNumber} updated successfully.`,
        data: {
          lifecycleCaseNumber:
            record.lifecycleCaseNumber,
          caseStatus: record.status,
          checklistItem,
          record,
        },
      });
    } catch (error) {
      console.error(
        "Update lifecycle checklist item error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update the controlled lifecycle checklist item.",
        error: error.message,
      });
    }
  };

module.exports = {
  startEmployeeLifecycleCase,
  updateEmployeeLifecycleChecklistItem,
};