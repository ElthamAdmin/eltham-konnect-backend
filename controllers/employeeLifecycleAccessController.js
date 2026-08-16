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

const normalizeOutcome = (value) => {
  const normalizedValue = normalizeString(
    value
  ).toLowerCase();

  if (normalizedValue === "completed") {
    return "Completed";
  }

  if (normalizedValue === "failed") {
    return "Failed";
  }

  return "";
};

const getLifecycleCase = async (
  lifecycleCaseNumber
) =>
  EmployeeLifecycleCase.findOne({
    lifecycleCaseNumber: normalizeString(
      lifecycleCaseNumber
    ).toUpperCase(),
  });

const findAccessItem = (
  record,
  accessItemNumber
) =>
  (record.systemAccessItems || []).find(
    (item) =>
      normalizeString(
        item.accessItemNumber
      ).toUpperCase() ===
      normalizeString(
        accessItemNumber
      ).toUpperCase()
  );

const addWorkflowHistory = ({
  record,
  action,
  performedBy,
  performedByUserId,
  notes,
}) => {
  record.workflowHistory =
    record.workflowHistory || [];

  record.workflowHistory.push({
    action,
    fromStatus: record.status,
    toStatus: record.status,
    performedBy,
    performedByUserId,
    performedAt: new Date(),
    notes,
  });
};

const requestEmployeeLifecycleAccessAction =
  async (req, res) => {
    try {
      const lifecycleCaseNumber =
        normalizeString(
          req.params.lifecycleCaseNumber
        ).toUpperCase();

      const accessItemNumber =
        normalizeString(
          req.params.accessItemNumber
        ).toUpperCase();

      const requestNotes =
        normalizeString(
          req.body.requestNotes ||
            req.body.notes
        );

      if (!requestNotes) {
        return res.status(400).json({
          success: false,
          message:
            "System-access request notes are required.",
        });
      }

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

      const allowedCaseStatuses = [
        "In Progress",
        "Blocked",
      ];

      if (
        !allowedCaseStatuses.includes(
          record.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `System-access actions cannot be requested while ${lifecycleCaseNumber} is ${record.status}.`,
          data: {
            lifecycleCaseNumber,
            currentStatus: record.status,
            allowedStatuses:
              allowedCaseStatuses,
          },
        });
      }

      const accessItem = findAccessItem(
        record,
        accessItemNumber
      );

      if (!accessItem) {
        return res.status(404).json({
          success: false,
          message:
            `System-access item ${accessItemNumber} was not found on ${lifecycleCaseNumber}.`,
        });
      }

      if (
        ![
          "Not Requested",
          "Failed",
        ].includes(accessItem.status)
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${accessItemNumber} cannot be requested while its status is ${accessItem.status}.`,
          data: {
            lifecycleCaseNumber,
            accessItemNumber,
            currentStatus:
              accessItem.status,
            allowedStatuses: [
              "Not Requested",
              "Failed",
            ],
          },
        });
      }

      const performedBy = getUserName(
        req.user
      );

      const performedByUserId = getUserId(
        req.user
      );

      const previousStatus =
        accessItem.status;

      accessItem.status = "Requested";
      accessItem.requestedAt =
        new Date();
      accessItem.requestedBy =
        performedBy;
      accessItem.requestedByUserId =
        performedByUserId;
      accessItem.completedAt = null;
      accessItem.completedBy = "";

      accessItem.completedByUserId =
        "";

      accessItem.notes = requestNotes;
      record.updatedBy = performedBy;

      addWorkflowHistory({
        record,
        action:
          "System Access Requested",
        performedBy,
        performedByUserId,
        notes:
          `${accessItemNumber}: ${accessItem.action} access action requested for ${accessItem.systemName}. ${requestNotes}`,
      });

      await record.save();

      await writeAuditLog({
        req,
        action:
          "Employee Lifecycle Access Requested",
        module: "HR",
        description:
          `${accessItemNumber} on ${lifecycleCaseNumber} was requested.`,
        targetType:
          "EmployeeLifecycleCase",
        targetId: lifecycleCaseNumber,
        metadata: {
          lifecycleCaseNumber,
          employeeId: record.employeeId,
          caseType: record.caseType,
          accessItemNumber,
          systemName:
            accessItem.systemName,
          accessAction:
            accessItem.action,
        },
        beforeValues: {
          accessStatus:
            previousStatus,
        },
        afterValues: {
          accessStatus:
            accessItem.status,
        },
      });

      return res.json({
        success: true,
        message:
          `${accessItemNumber} requested successfully. No system-user account was changed.`,
        data: {
          lifecycleCaseNumber,
          accessItem,
          systemUserChanged: false,
        },
      });
    } catch (error) {
      console.error(
        "Request lifecycle access action error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to record the controlled system-access request.",
        error: error.message,
      });
    }
  };

const completeEmployeeLifecycleAccessAction =
  async (req, res) => {
    try {
      const lifecycleCaseNumber =
        normalizeString(
          req.params.lifecycleCaseNumber
        ).toUpperCase();

      const accessItemNumber =
        normalizeString(
          req.params.accessItemNumber
        ).toUpperCase();

      const outcome = normalizeOutcome(
        req.body.outcome
      );

      const completionNotes =
        normalizeString(
          req.body.completionNotes ||
            req.body.notes
        );

      const evidenceReference =
        normalizeString(
          req.body.evidenceReference
        );

      if (!outcome) {
        return res.status(400).json({
          success: false,
          message:
            "System-access outcome must be Completed or Failed.",
        });
      }

      if (!completionNotes) {
        return res.status(400).json({
          success: false,
          message:
            "System-access outcome notes are required.",
        });
      }

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

      const allowedCaseStatuses = [
        "In Progress",
        "Blocked",
      ];

      if (
        !allowedCaseStatuses.includes(
          record.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `System-access outcomes cannot be recorded while ${lifecycleCaseNumber} is ${record.status}.`,
          data: {
            lifecycleCaseNumber,
            currentStatus: record.status,
            allowedStatuses:
              allowedCaseStatuses,
          },
        });
      }

      const accessItem = findAccessItem(
        record,
        accessItemNumber
      );

      if (!accessItem) {
        return res.status(404).json({
          success: false,
          message:
            `System-access item ${accessItemNumber} was not found on ${lifecycleCaseNumber}.`,
        });
      }

      if (
        ![
          "Requested",
          "In Progress",
        ].includes(accessItem.status)
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${accessItemNumber} cannot receive an outcome while its status is ${accessItem.status}.`,
          data: {
            lifecycleCaseNumber,
            accessItemNumber,
            currentStatus:
              accessItem.status,
            allowedStatuses: [
              "Requested",
              "In Progress",
            ],
          },
        });
      }

      const performedBy = getUserName(
        req.user
      );

      const performedByUserId = getUserId(
        req.user
      );

      const previousStatus =
        accessItem.status;

      accessItem.status = outcome;
      accessItem.completedAt =
        new Date();
      accessItem.completedBy =
        performedBy;

      accessItem.completedByUserId =
        performedByUserId;

      accessItem.notes =
        completionNotes;

      if (evidenceReference) {
        accessItem.notes +=
          ` Evidence: ${evidenceReference}`;
      }

      record.updatedBy = performedBy;

      addWorkflowHistory({
        record,
        action:
          outcome === "Completed"
            ? "System Access Completed"
            : "System Access Failed",
        performedBy,
        performedByUserId,
        notes:
          `${accessItemNumber}: ${accessItem.action} access action for ${accessItem.systemName} recorded as ${outcome}. ${completionNotes}` +
          (evidenceReference
            ? ` Evidence: ${evidenceReference}`
            : ""),
      });

      await record.save();

      await writeAuditLog({
        req,
        action:
          outcome === "Completed"
            ? "Employee Lifecycle Access Completed"
            : "Employee Lifecycle Access Failed",
        module: "HR",
        description:
          `${accessItemNumber} on ${lifecycleCaseNumber} was recorded as ${outcome}.`,
        targetType:
          "EmployeeLifecycleCase",
        targetId: lifecycleCaseNumber,
        metadata: {
          lifecycleCaseNumber,
          employeeId: record.employeeId,
          caseType: record.caseType,
          accessItemNumber,
          systemName:
            accessItem.systemName,
          accessAction:
            accessItem.action,
          outcome,
          evidenceReference,
        },
        beforeValues: {
          accessStatus:
            previousStatus,
        },
        afterValues: {
          accessStatus:
            accessItem.status,
        },
      });

      return res.json({
        success: true,
        message:
          `${accessItemNumber} recorded as ${outcome}. No system-user account was changed.`,
        data: {
          lifecycleCaseNumber,
          accessItem,
          systemUserChanged: false,
        },
      });
    } catch (error) {
      console.error(
        "Complete lifecycle access action error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to record the controlled system-access outcome.",
        error: error.message,
      });
    }
  };

module.exports = {
  requestEmployeeLifecycleAccessAction,
  completeEmployeeLifecycleAccessAction,
};