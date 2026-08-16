const EmployeeLifecycleCase = require(
  "../models/EmployeeLifecycleCase"
);

const Payroll = require(
  "../models/Payroll"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const COORDINATION_STATUSES = [
  "Pending Review",
  "Awaiting Payroll",
  "Blocked",
];

const CLOSED_CASE_STATUSES = [
  "Completed",
  "Cancelled",
];

const LINK_ALLOWED_CASE_STATUSES = [
  "Approved",
  "In Progress",
  "Blocked",
  "Ready for Completion",
];

const LINKABLE_PAYROLL_STATUSES = [
  "Draft",
  "Pending",
  "Approved",
  "Paid",
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

const getLifecycleCase = async (
  lifecycleCaseNumber
) =>
  EmployeeLifecycleCase.findOne({
    lifecycleCaseNumber:
      normalizeString(
        lifecycleCaseNumber
      ).toUpperCase(),
  });

const validateOffboardingCase = (
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
    "Offboarding"
  ) {
    res.status(409).json({
      success: false,
      message:
        "Final-payroll coordination is available only for offboarding cases.",
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
        `${lifecycleCase.lifecycleCaseNumber} is ${lifecycleCase.status} and cannot receive final-payroll updates.`,
    });

    return false;
  }

  return true;
};

const updateFinalPayrollCoordination =
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

      const targetPayDate =
        normalizeString(
          req.body?.targetPayDate
        );

      const outstandingPayNotes =
        normalizeString(
          req.body?.outstandingPayNotes
        );

      const leaveSettlementNotes =
        normalizeString(
          req.body?.leaveSettlementNotes
        );

      const advanceRecoveryNotes =
        normalizeString(
          req.body?.advanceRecoveryNotes
        );

      const exceptionMessage =
        normalizeString(
          req.body?.exceptionMessage
        );

      if (
        typeof required !==
        "boolean"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Final payroll required must be true or false.",
        });
      }

      if (!required) {
        if (!outstandingPayNotes) {
          return res.status(400).json({
            success: false,
            message:
              "Final-payroll exclusion notes are required when final payroll is not required.",
          });
        }
      } else {
        if (
          !COORDINATION_STATUSES.includes(
            status
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Final-payroll coordination status must be Pending Review, Awaiting Payroll or Blocked.",
          });
        }

        if (!targetPayDate) {
          return res.status(400).json({
            success: false,
            message:
              "Final-payroll target date is required.",
          });
        }

        if (
          !isValidYmdDate(
            targetPayDate
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Final-payroll target date must use YYYY-MM-DD.",
          });
        }

        if (!outstandingPayNotes) {
          return res.status(400).json({
            success: false,
            message:
              "Outstanding-pay review notes are required.",
          });
        }

        if (
          status ===
            "Blocked" &&
          !exceptionMessage
        ) {
          return res.status(400).json({
            success: false,
            message:
              "A final-payroll exception message is required when coordination is blocked.",
          });
        }
      }

      const lifecycleCase =
        await getLifecycleCase(
          lifecycleCaseNumber
        );

      if (
        !validateOffboardingCase(
          lifecycleCase,
          res
        )
      ) {
        return;
      }

      const actorName =
        getUserName(req.user);

      const actorUserId =
        getUserId(req.user);

      const beforeValues =
        lifecycleCase
          .finalPayroll
          .toObject();

      if (!required) {
        lifecycleCase.finalPayroll = {
          required: false,
          status:
            "Not Required",
          targetPayDate: "",
          payrollNumber: "",
          payPeriod: "",
          payrollStatus: "",
          grossPay: 0,
          totalDeductions: 0,
          netPay: 0,
          journalEntryNumber: "",
          outstandingPayNotes,
          leaveSettlementNotes: "",
          advanceRecoveryNotes: "",
          exceptionMessage: "",
          reviewedBy:
            actorName,
          reviewedByUserId:
            actorUserId,
          reviewedAt:
            new Date(),
          completedAt: null,
        };
      } else {
        lifecycleCase
          .finalPayroll
          .required = true;

        lifecycleCase
          .finalPayroll
          .status = status;

        lifecycleCase
          .finalPayroll
          .targetPayDate =
          targetPayDate;

        lifecycleCase
          .finalPayroll
          .outstandingPayNotes =
          outstandingPayNotes;

        lifecycleCase
          .finalPayroll
          .leaveSettlementNotes =
          leaveSettlementNotes;

        lifecycleCase
          .finalPayroll
          .advanceRecoveryNotes =
          advanceRecoveryNotes;

        lifecycleCase
          .finalPayroll
          .exceptionMessage =
          status === "Blocked"
            ? exceptionMessage
            : "";

        lifecycleCase
          .finalPayroll
          .reviewedBy =
          actorName;

        lifecycleCase
          .finalPayroll
          .reviewedByUserId =
          actorUserId;

        lifecycleCase
          .finalPayroll
          .reviewedAt =
          new Date();
      }

      lifecycleCase.updatedBy =
        actorName;

      lifecycleCase.workflowHistory.push({
        action:
          required
            ? "Final Payroll Coordination Updated"
            : "Final Payroll Marked Not Required",

        fromStatus:
          lifecycleCase.status,

        toStatus:
          lifecycleCase.status,

        notes:
          outstandingPayNotes,

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
          .finalPayroll
          .toObject();

      await writeAuditLog({
        req,

        action:
          required
            ? "Lifecycle Final Payroll Updated"
            : "Lifecycle Final Payroll Excluded",

        module:
          "HR Employee Lifecycle",

        description:
          required
            ? `Final-payroll coordination was updated for ${lifecycleCase.lifecycleCaseNumber}.`
            : `Final payroll was marked not required for ${lifecycleCase.lifecycleCaseNumber}.`,

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

          finalPayrollRequired:
            required,

          finalPayrollStatus:
            lifecycleCase
              .finalPayroll
              .status,

          targetPayDate:
            lifecycleCase
              .finalPayroll
              .targetPayDate,
        },

        beforeValues,
        afterValues,
      });

      return res.json({
        success: true,

        message:
          required
            ? "Final-payroll coordination updated successfully."
            : "Final payroll marked not required successfully.",

        data: {
          lifecycleCaseNumber:
            lifecycleCase
              .lifecycleCaseNumber,

          employeeId:
            lifecycleCase.employeeId,

          caseStatus:
            lifecycleCase.status,

          finalPayroll:
            lifecycleCase
              .finalPayroll,
        },
      });
    } catch (error) {
      console.error(
        "Update lifecycle final payroll error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update final-payroll coordination.",
        error:
          error.message,
      });
    }
  };

const linkFinalPayrollRecord =
  async (req, res) => {
    try {
      const {
        lifecycleCaseNumber,
      } = req.params;

      const payrollNumber =
        normalizeString(
          req.body?.payrollNumber
        ).toUpperCase();

      const linkNotes =
        normalizeString(
          req.body?.linkNotes
        );

      const leaveSettlementNotes =
        normalizeString(
          req.body?.leaveSettlementNotes
        );

      const advanceRecoveryNotes =
        normalizeString(
          req.body?.advanceRecoveryNotes
        );

      if (!payrollNumber) {
        return res.status(400).json({
          success: false,
          message:
            "A payroll number is required.",
        });
      }

      if (!linkNotes) {
        return res.status(400).json({
          success: false,
          message:
            "Final-payroll linkage notes are required.",
        });
      }

      const lifecycleCase =
        await getLifecycleCase(
          lifecycleCaseNumber
        );

      if (
        !validateOffboardingCase(
          lifecycleCase,
          res
        )
      ) {
        return;
      }

      if (
        !LINK_ALLOWED_CASE_STATUSES.includes(
          lifecycleCase.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Final payroll may be linked only after the offboarding case has been approved.",
        });
      }

      if (
        !lifecycleCase
          .finalPayroll
          .required
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This offboarding case does not require final payroll.",
        });
      }

      const payroll =
        await Payroll.findOne({
          payrollNumber,
        });

      if (!payroll) {
        return res.status(404).json({
          success: false,
          message:
            "Controlled payroll record not found.",
        });
      }

      if (
        normalizeString(
          payroll.employeeId
        ).toUpperCase() !==
        normalizeString(
          lifecycleCase.employeeId
        ).toUpperCase()
      ) {
        return res.status(409).json({
          success: false,
          message:
            "The selected payroll belongs to a different employee.",
        });
      }

      if (
        !LINKABLE_PAYROLL_STATUSES.includes(
          payroll.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${payroll.payrollNumber} cannot be linked because its status is ${payroll.status}.`,
        });
      }

      if (
        lifecycleCase
          .finalPayroll
          .payrollNumber &&
        lifecycleCase
          .finalPayroll
          .payrollNumber !==
          payroll.payrollNumber
      ) {
        return res.status(409).json({
          success: false,
          message:
            `Final payroll is already linked to ${lifecycleCase.finalPayroll.payrollNumber}.`,
        });
      }

      const actorName =
        getUserName(req.user);

      const actorUserId =
        getUserId(req.user);

      const linkedAt =
        new Date();

      const beforeValues =
        lifecycleCase
          .finalPayroll
          .toObject();

      let coordinationStatus =
        "Payroll Linked";

      if (
        payroll.status ===
        "Approved"
      ) {
        coordinationStatus =
          "Approved";
      }

      if (
        payroll.status ===
        "Paid"
      ) {
        coordinationStatus =
          "Paid";
      }

      lifecycleCase
        .finalPayroll
        .status =
        coordinationStatus;

      lifecycleCase
        .finalPayroll
        .payrollNumber =
        payroll.payrollNumber;

      lifecycleCase
        .finalPayroll
        .payPeriod =
        normalizeString(
          payroll.payPeriod
        );

      lifecycleCase
        .finalPayroll
        .payrollStatus =
        payroll.status;

      lifecycleCase
        .finalPayroll
        .grossPay =
        Number(
          payroll.grossPay || 0
        );

      lifecycleCase
        .finalPayroll
        .totalDeductions =
        Number(
          payroll.totalDeductions ||
            0
        );

      lifecycleCase
        .finalPayroll
        .netPay =
        Number(
          payroll.netPay || 0
        );

      lifecycleCase
        .finalPayroll
        .journalEntryNumber =
        normalizeString(
          payroll
            .journalEntryNumber
        );

      lifecycleCase
        .finalPayroll
        .outstandingPayNotes =
        linkNotes;

      if (leaveSettlementNotes) {
        lifecycleCase
          .finalPayroll
          .leaveSettlementNotes =
          leaveSettlementNotes;
      }

      if (advanceRecoveryNotes) {
        lifecycleCase
          .finalPayroll
          .advanceRecoveryNotes =
          advanceRecoveryNotes;
      }

      lifecycleCase
        .finalPayroll
        .exceptionMessage = "";

      lifecycleCase
        .finalPayroll
        .reviewedBy =
        actorName;

      lifecycleCase
        .finalPayroll
        .reviewedByUserId =
        actorUserId;

      lifecycleCase
        .finalPayroll
        .reviewedAt =
        linkedAt;

      lifecycleCase
        .finalPayroll
        .completedAt =
        payroll.status === "Paid"
          ? linkedAt
          : null;

      lifecycleCase.updatedBy =
        actorName;

      lifecycleCase.workflowHistory.push({
        action:
          "Final Payroll Linked",

        fromStatus:
          lifecycleCase.status,

        toStatus:
          lifecycleCase.status,

        notes:
          `${payroll.payrollNumber} linked with payroll status ${payroll.status}. ${linkNotes}`,

        performedBy:
          actorName,

        performedByUserId:
          actorUserId,

        performedAt:
          linkedAt,
      });

      await lifecycleCase.save();

      const afterValues =
        lifecycleCase
          .finalPayroll
          .toObject();

      await writeAuditLog({
        req,

        action:
          "Lifecycle Final Payroll Linked",

        module:
          "HR Employee Lifecycle",

        description:
          `${payroll.payrollNumber} was linked to ${lifecycleCase.lifecycleCaseNumber}.`,

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

          payrollNumber:
            payroll.payrollNumber,

          payPeriod:
            payroll.payPeriod,

          payrollStatus:
            payroll.status,

          grossPay:
            payroll.grossPay,

          totalDeductions:
            payroll.totalDeductions,

          netPay:
            payroll.netPay,

          journalEntryNumber:
            payroll
              .journalEntryNumber ||
            "",
        },

        beforeValues,
        afterValues,
      });

      return res.json({
        success: true,
        message:
          `${payroll.payrollNumber} linked as final payroll successfully.`,

        data: {
          lifecycleCaseNumber:
            lifecycleCase
              .lifecycleCaseNumber,

          employeeId:
            lifecycleCase.employeeId,

          caseStatus:
            lifecycleCase.status,

          finalPayroll:
            lifecycleCase
              .finalPayroll,
        },
      });
    } catch (error) {
      console.error(
        "Link lifecycle final payroll error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to link the final-payroll record.",
        error:
          error.message,
      });
    }
  };

module.exports = {
  updateFinalPayrollCoordination,
  linkFinalPayrollRecord,
};