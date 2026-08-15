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

const normalizeDecision = (value) => {
  const normalizedValue = normalizeString(
    value
  ).toLowerCase();

  if (normalizedValue === "approved") {
    return "Approved";
  }

  if (normalizedValue === "rejected") {
    return "Rejected";
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

const submitEmployeeLifecycleCase = async (
  req,
  res
) => {
  try {
    const lifecycleCaseNumber =
      normalizeString(
        req.params.lifecycleCaseNumber
      ).toUpperCase();

    const submissionNotes =
      normalizeString(
        req.body.submissionNotes ||
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

    if (record.status !== "Draft") {
      return res.status(409).json({
        success: false,
        message:
          `Only a Draft lifecycle case can be submitted. ${lifecycleCaseNumber} is currently ${record.status}.`,
        data: {
          lifecycleCaseNumber,
          currentStatus: record.status,
          allowedStatus: "Draft",
        },
      });
    }

    if (!normalizeString(record.reason)) {
      return res.status(409).json({
        success: false,
        message:
          "The lifecycle case cannot be submitted without a reason.",
      });
    }

    if (
      !normalizeString(
        record.plannedEffectiveDate
      )
    ) {
      return res.status(409).json({
        success: false,
        message:
          "The lifecycle case cannot be submitted without a planned effective date.",
      });
    }

    if (
      !Array.isArray(record.checklistItems) ||
      record.checklistItems.length === 0
    ) {
      return res.status(409).json({
        success: false,
        message:
          "The lifecycle case cannot be submitted without a controlled checklist.",
      });
    }

    const performedBy = getUserName(
      req.user
    );

    const performedByUserId = getUserId(
      req.user
    );

    const fromStatus = record.status;

    record.status = "Pending Approval";
    record.updatedBy = performedBy;

    if (record.managerApproval?.required) {
      record.managerApproval.status =
        "Pending";
      record.managerApproval.decidedBy =
        "";
      record.managerApproval.decidedByUserId =
        "";
      record.managerApproval.decidedAt =
        null;
      record.managerApproval.notes = "";
    }

    if (record.hrApproval?.required) {
      record.hrApproval.status =
        "Pending";
      record.hrApproval.decidedBy = "";
      record.hrApproval.decidedByUserId =
        "";
      record.hrApproval.decidedAt = null;
      record.hrApproval.notes = "";
    }

    addWorkflowHistory({
      record,
      action: "Submitted",
      fromStatus,
      toStatus: "Pending Approval",
      performedBy,
      performedByUserId,
      notes:
        submissionNotes ||
        "Controlled lifecycle case submitted for manager and HR approval.",
    });

    await record.save();

    await writeAuditLog({
      req,
      action:
        "Employee Lifecycle Case Submitted",
      module: "HR",
      description:
        `${lifecycleCaseNumber} was submitted for controlled approval.`,
      targetType:
        "EmployeeLifecycleCase",
      targetId: lifecycleCaseNumber,
      metadata: {
        lifecycleCaseNumber,
        employeeId: record.employeeId,
        caseType: record.caseType,
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
        `${lifecycleCaseNumber} submitted successfully.`,
      data: record,
    });
  } catch (error) {
    console.error(
      "Submit employee lifecycle case error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to submit the controlled employee lifecycle case.",
      error: error.message,
    });
  }
};

const decideEmployeeLifecycleCaseByManager =
  async (req, res) => {
    try {
      const lifecycleCaseNumber =
        normalizeString(
          req.params.lifecycleCaseNumber
        ).toUpperCase();

      const decision = normalizeDecision(
        req.body.decision
      );

      const notes = normalizeString(
        req.body.notes ||
          req.body.decisionNotes
      );

      if (!decision) {
        return res.status(400).json({
          success: false,
          message:
            "Manager decision must be Approved or Rejected.",
        });
      }

      if (!notes) {
        return res.status(400).json({
          success: false,
          message:
            "Manager decision notes are required.",
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

      if (
        record.status !==
        "Pending Approval"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `Manager decisions are allowed only while a case is Pending Approval. ${lifecycleCaseNumber} is currently ${record.status}.`,
          data: {
            lifecycleCaseNumber,
            currentStatus: record.status,
            allowedStatus:
              "Pending Approval",
          },
        });
      }

      if (
        record.managerApproval?.required ===
        false
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${lifecycleCaseNumber} does not require manager approval.`,
        });
      }

      if (
        record.managerApproval?.status ===
          "Approved" ||
        record.managerApproval?.status ===
          "Rejected"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${lifecycleCaseNumber} already has a manager decision.`,
          data: {
            lifecycleCaseNumber,
            managerDecision:
              record.managerApproval.status,
          },
        });
      }

      const performedBy = getUserName(
        req.user
      );

      const performedByUserId = getUserId(
        req.user
      );

      const fromStatus = record.status;

      record.managerApproval.status =
        decision;

      record.managerApproval.decidedBy =
        performedBy;

      record.managerApproval.decidedByUserId =
        performedByUserId;

      record.managerApproval.decidedAt =
        new Date();

      record.managerApproval.notes = notes;
      record.updatedBy = performedBy;

      if (decision === "Rejected") {
        record.status = "Cancelled";
      }

      addWorkflowHistory({
        record,
        action:
          decision === "Approved"
            ? "Manager Approved"
            : "Manager Rejected",
        fromStatus,
        toStatus: record.status,
        performedBy,
        performedByUserId,
        notes,
      });

      await record.save();

      await writeAuditLog({
        req,
        action:
          decision === "Approved"
            ? "Employee Lifecycle Manager Approved"
            : "Employee Lifecycle Manager Rejected",
        module: "HR",
        description:
          `${lifecycleCaseNumber} was ${decision.toLowerCase()} at the manager stage.`,
        targetType:
          "EmployeeLifecycleCase",
        targetId: lifecycleCaseNumber,
        metadata: {
          lifecycleCaseNumber,
          employeeId: record.employeeId,
          caseType: record.caseType,
          decision,
        },
        beforeValues: {
          status: fromStatus,
          managerDecision: "Pending",
        },
        afterValues: {
          status: record.status,
          managerDecision:
            record.managerApproval.status,
        },
      });

      return res.json({
        success: true,
        message:
          `${lifecycleCaseNumber} manager-${decision.toLowerCase()} successfully.`,
        data: record,
      });
    } catch (error) {
      console.error(
        "Manager lifecycle decision error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to record the manager lifecycle decision.",
        error: error.message,
      });
    }
  };

const decideEmployeeLifecycleCaseByHr =
  async (req, res) => {
    try {
      const lifecycleCaseNumber =
        normalizeString(
          req.params.lifecycleCaseNumber
        ).toUpperCase();

      const decision = normalizeDecision(
        req.body.decision
      );

      const notes = normalizeString(
        req.body.notes ||
          req.body.decisionNotes
      );

      if (!decision) {
        return res.status(400).json({
          success: false,
          message:
            "HR decision must be Approved or Rejected.",
        });
      }

      if (!notes) {
        return res.status(400).json({
          success: false,
          message:
            "HR decision notes are required.",
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

      if (
        record.status !==
        "Pending Approval"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `HR decisions are allowed only while a case is Pending Approval. ${lifecycleCaseNumber} is currently ${record.status}.`,
          data: {
            lifecycleCaseNumber,
            currentStatus: record.status,
            allowedStatus:
              "Pending Approval",
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
            "Manager approval must be completed before the HR decision.",
          data: {
            lifecycleCaseNumber,
            managerDecision:
              record.managerApproval?.status ||
              "Pending",
          },
        });
      }

      if (
        record.hrApproval?.required ===
        false
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${lifecycleCaseNumber} does not require HR approval.`,
        });
      }

      if (
        record.hrApproval?.status ===
          "Approved" ||
        record.hrApproval?.status ===
          "Rejected"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${lifecycleCaseNumber} already has an HR decision.`,
          data: {
            lifecycleCaseNumber,
            hrDecision:
              record.hrApproval.status,
          },
        });
      }

      const performedBy = getUserName(
        req.user
      );

      const performedByUserId = getUserId(
        req.user
      );

      const fromStatus = record.status;

      record.hrApproval.status = decision;

      record.hrApproval.decidedBy =
        performedBy;

      record.hrApproval.decidedByUserId =
        performedByUserId;

      record.hrApproval.decidedAt =
        new Date();

      record.hrApproval.notes = notes;
      record.updatedBy = performedBy;

      record.status =
        decision === "Approved"
          ? "Approved"
          : "Cancelled";

      addWorkflowHistory({
        record,
        action:
          decision === "Approved"
            ? "HR Approved"
            : "HR Rejected",
        fromStatus,
        toStatus: record.status,
        performedBy,
        performedByUserId,
        notes,
      });

      await record.save();

      await writeAuditLog({
        req,
        action:
          decision === "Approved"
            ? "Employee Lifecycle HR Approved"
            : "Employee Lifecycle HR Rejected",
        module: "HR",
        description:
          `${lifecycleCaseNumber} was ${decision.toLowerCase()} at the HR stage.`,
        targetType:
          "EmployeeLifecycleCase",
        targetId: lifecycleCaseNumber,
        metadata: {
          lifecycleCaseNumber,
          employeeId: record.employeeId,
          caseType: record.caseType,
          decision,
        },
        beforeValues: {
          status: fromStatus,
          hrDecision: "Pending",
        },
        afterValues: {
          status: record.status,
          hrDecision:
            record.hrApproval.status,
        },
      });

      return res.json({
        success: true,
        message:
          `${lifecycleCaseNumber} HR-${decision.toLowerCase()} successfully.`,
        data: record,
      });
    } catch (error) {
      console.error(
        "HR lifecycle decision error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to record the HR lifecycle decision.",
        error: error.message,
      });
    }
  };

module.exports = {
  submitEmployeeLifecycleCase,
  decideEmployeeLifecycleCaseByManager,
  decideEmployeeLifecycleCaseByHr,
};