const mongoose = require("mongoose");

const LeaveRequest = require("../models/LeaveRequest");
const HREmployee = require("../models/HREmployee");

const {
  calculateLeaveRequestTreatment,
  postLeaveBalanceTransaction,
} = require("../services/leaveManagementService");

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const ACTIVE_REQUEST_STATUSES = [
  "Draft",
  "Pending",
  "Submitted",
  "Manager Approved",
  "Approved",
];

const normalizeString = (value) =>
  String(value || "").trim();

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const getUserId = (user) =>
  String(user?.userId || user?._id || "");

const isHrUser = (req) =>
  req.user?.role === "Admin" ||
  (req.user?.permissions || []).includes("hr");

const createNextLeaveRequestId = async () => {
  const lastRequest = await LeaveRequest.findOne()
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .select("leaveRequestId");

  const lastNumber = Number.parseInt(
    String(
      lastRequest?.leaveRequestId || ""
    ).replace(/\D/g, ""),
    10
  );

  const nextNumber = Number.isFinite(
    lastNumber
  )
    ? lastNumber + 1
    : 1;

  return `LR${String(nextNumber).padStart(
    5,
    "0"
  )}`;
};

const getEmployeeForRequest = async ({
  req,
  requestedEmployeeId = "",
}) => {
  if (isHrUser(req)) {
    const employeeId = normalizeString(
      requestedEmployeeId
    );

    if (!employeeId) {
      throw new Error(
        "Employee is required."
      );
    }

    return HREmployee.findOne({
      employeeId,
    });
  }

  return HREmployee.findOne({
    linkedUserId: getUserId(req.user),
  });
};

const canAccessRequest = (
  req,
  leaveRequest
) =>
  isHrUser(req) ||
  normalizeString(
    leaveRequest.linkedUserId
  ) === getUserId(req.user);

const appendWorkflow = ({
  leaveRequest,
  action,
  fromStatus = "",
  toStatus = "",
  notes = "",
  user,
}) => {
  leaveRequest.workflowHistory.push({
    action,
    fromStatus,
    toStatus,
    notes: normalizeString(notes),
    performedBy: getUserName(user),
    performedByUserId:
      getUserId(user),
    performedAt: new Date(),
  });
};

const buildPolicySnapshot = (policy) => {
  const source =
    typeof policy?.toObject === "function"
      ? policy.toObject()
      : policy;

  if (!source) {
    return null;
  }

  const {
    _id,
    __v,
    createdAt,
    updatedAt,
    ...snapshot
  } = source;

  return snapshot;
};

const buildLeaveRequestFields = ({
  employee,
  policy,
  treatment,
  leaveType,
  startDate,
  endDate,
  reason,
  employeeComments,
}) => ({
  employeeId: employee.employeeId,
  linkedUserId:
    employee.linkedUserId || "",
  employeeName: employee.fullName,

  employeeSnapshot: {
    jobTitle: employee.jobTitle || "",
    department:
      employee.department || "",
    branch: employee.branch || "",
    employmentClassification:
      employee.employmentClassification ||
      employee.employmentType ||
      "",
    employmentStatus:
      employee.employmentStatus || "",
    payFrequency:
      employee.payFrequency || "",
    payrollEnabled: Boolean(
      employee.payrollEnabled
    ),
  },

  department:
    employee.department || "",
  branch: employee.branch || "",
  leaveType,
  legalClassification:
    treatment.legalClassification,
  policyCode: policy.policyCode,
  policyName: policy.policyName,
  policyEffectiveFrom:
    policy.effectiveFrom,
  policySnapshot:
    buildPolicySnapshot(policy),
  startDate,
  endDate,
  totalDays: treatment.totalDays,
  totalScheduledMinutes:
    treatment.totalScheduledMinutes,
  payableLeaveMinutes:
    treatment.payableLeaveMinutes,
  unpaidLeaveMinutes:
    treatment.unpaidLeaveMinutes,
  dailyBreakdown:
    treatment.dailyBreakdown,
  payTreatment:
    treatment.payTreatment,
  payrollEffect:
    treatment.payrollEffect,
  countsAsPayableAttendance:
    treatment.countsAsPayableAttendance,
  balanceType:
    treatment.balanceType || "",
  balanceEffect:
    treatment.balanceEffect,
  balanceUnits:
    treatment.balanceUnits,
  reason: normalizeString(reason),
  employeeComments:
    normalizeString(employeeComments),
  supportingDocumentsRequired:
    treatment.supportingDocumentsRequired,
  documentStatus:
    treatment.documentStatus,
  medicalCertificateRequired:
    treatment.medicalCertificateRequired,

  managerDecision: {
    status:
      policy.managerApprovalRequired ===
      false
        ? "Not Required"
        : "Pending",
  },

  hrDecision: {
    status:
      policy.hrApprovalRequired === false
        ? "Not Required"
        : "Pending",
  },

  employeeAcknowledgement: {
    required: Boolean(
      policy.employeeAcknowledgementRequired
    ),
    acknowledged: false,
  },

  attendanceProcessing: {
    status: "Pending",
  },

  payrollProcessing: {
    status:
      treatment.payrollEffect ===
      "Manual Review"
        ? "Pending"
        : "Pending",
  },

  nisCoordination: {
    required:
      treatment.payTreatment ===
      "NIS-Coordinated",
    status:
      treatment.payTreatment ===
      "NIS-Coordinated"
        ? "Pending"
        : "Not Required",
  },
});

const ensureNoOverlap = async ({
  employeeId,
  startDate,
  endDate,
  excludeLeaveRequestId = "",
}) => {
  const query = {
    employeeId,
    status: {
      $in: ACTIVE_REQUEST_STATUSES,
    },
    startDate: {
      $lte: endDate,
    },
    endDate: {
      $gte: startDate,
    },
  };

  if (excludeLeaveRequestId) {
    query.leaveRequestId = {
      $ne: excludeLeaveRequestId,
    };
  }

  const existing =
    await LeaveRequest.findOne(query)
      .select(
        "leaveRequestId startDate endDate status"
      )
      .lean();

  if (existing) {
    const error = new Error(
      `This leave overlaps ${existing.leaveRequestId}, dated ${existing.startDate} to ${existing.endDate}.`
    );

    error.statusCode = 409;
    error.data = existing;
    throw error;
  }
};

const sendControllerError = (
  res,
  error,
  fallbackMessage
) =>
  res
    .status(error.statusCode || 400)
    .json({
      success: false,
      message:
        error.message || fallbackMessage,
      ...(error.data
        ? {
            data: error.data,
          }
        : {}),
    });

const getLeaveRequests = async (
  req,
  res
) => {
  try {
    const filter = {};

    if (!isHrUser(req)) {
      filter.linkedUserId =
        getUserId(req.user);
    } else {
      const employeeId =
        normalizeString(
          req.query.employeeId
        );

      const status = normalizeString(
        req.query.status
      );

      const leaveType =
        normalizeString(
          req.query.leaveType
        );

      if (employeeId) {
        filter.employeeId = employeeId;
      }

      if (status) {
        filter.status = status;
      }

      if (leaveType) {
        filter.leaveType = leaveType;
      }
    }

    const leaveRequests =
      await LeaveRequest.find(filter).sort({
        createdAt: -1,
        _id: -1,
      });

    return res.json({
      success: true,
      message:
        "Leave requests retrieved successfully",
      totalLeaveRequests:
        leaveRequests.length,
      data: leaveRequests,
    });
  } catch (error) {
    console.error(
      "Get leave requests error:",
      error
    );

    return sendControllerError(
      res,
      error,
      "Could not retrieve leave requests."
    );
  }
};

const getLeaveRequestById = async (
  req,
  res
) => {
  try {
    const leaveRequest =
      await LeaveRequest.findOne({
        leaveRequestId:
          req.params.leaveRequestId,
      });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message:
          "Leave request was not found.",
      });
    }

    if (
      !canAccessRequest(
        req,
        leaveRequest
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    return res.json({
      success: true,
      message:
        "Leave request retrieved successfully",
      data: leaveRequest,
    });
  } catch (error) {
    console.error(
      "Get leave request error:",
      error
    );

    return sendControllerError(
      res,
      error,
      "Could not retrieve the leave request."
    );
  }
};

const previewLeaveRequest = async (
  req,
  res
) => {
  try {
    const {
      employeeId,
      leaveType,
      startDate,
      endDate,
    } = req.body;

    const employee =
      await getEmployeeForRequest({
        req,
        requestedEmployeeId:
          employeeId,
      });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message:
          "Employee was not found or is not linked to this user.",
      });
    }

    const calculation =
      await calculateLeaveRequestTreatment({
        employeeId:
          employee.employeeId,
        leaveType:
          normalizeString(leaveType),
        startDate:
          normalizeString(startDate),
        endDate:
          normalizeString(endDate),
      });

    await ensureNoOverlap({
      employeeId:
        employee.employeeId,
      startDate:
        normalizeString(startDate),
      endDate:
        normalizeString(endDate),
    });

    return res.json({
      success: true,
      message:
        "Leave request preview generated successfully. No request was created.",
      data: {
        employee: {
          employeeId:
            employee.employeeId,
          fullName:
            employee.fullName,
          jobTitle:
            employee.jobTitle || "",
          department:
            employee.department || "",
          branch:
            employee.branch || "",
        },
        policy:
          buildPolicySnapshot(
            calculation.policy
          ),
        treatment:
          calculation.treatment,
      },
    });
  } catch (error) {
    console.error(
      "Preview leave request error:",
      error
    );

    return sendControllerError(
      res,
      error,
      "Could not preview the leave request."
    );
  }
};

const createLeaveRequest = async (
  req,
  res
) => {
  try {
    const {
      employeeId,
      leaveType,
      startDate,
      endDate,
      reason,
      employeeComments,
    } = req.body;

    if (
      !normalizeString(leaveType) ||
      !normalizeString(startDate) ||
      !normalizeString(endDate)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Leave type, start date, and end date are required.",
      });
    }

    const employee =
      await getEmployeeForRequest({
        req,
        requestedEmployeeId:
          employeeId,
      });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message:
          "Employee was not found or is not linked to this user.",
      });
    }

    const calculation =
      await calculateLeaveRequestTreatment({
        employeeId:
          employee.employeeId,
        leaveType:
          normalizeString(leaveType),
        startDate:
          normalizeString(startDate),
        endDate:
          normalizeString(endDate),
      });

    await ensureNoOverlap({
      employeeId:
        employee.employeeId,
      startDate:
        normalizeString(startDate),
      endDate:
        normalizeString(endDate),
    });

    const leaveRequest =
      new LeaveRequest({
        leaveRequestId:
          await createNextLeaveRequestId(),

        ...buildLeaveRequestFields({
          employee:
            calculation.employee,
          policy:
            calculation.policy,
          treatment:
            calculation.treatment,
          leaveType:
            normalizeString(leaveType),
          startDate:
            normalizeString(startDate),
          endDate:
            normalizeString(endDate),
          reason,
          employeeComments,
        }),

        status: "Draft",
        submittedBy: "",
        createdBy:
          getUserName(req.user),
        updatedBy:
          getUserName(req.user),
      });

    appendWorkflow({
      leaveRequest,
      action: "Created",
      fromStatus: "",
      toStatus: "Draft",
      notes:
        "Policy-controlled leave draft created.",
      user: req.user,
    });

    await leaveRequest.save();

    await writeAuditLog({
      req,
      action:
        "CREATE_LEAVE_REQUEST_DRAFT",
      module: "HR",
      description:
        `Leave request ${leaveRequest.leaveRequestId} created as Draft.`,
      targetType: "LeaveRequest",
      targetId:
        leaveRequest.leaveRequestId,
      afterValues:
        leaveRequest.toObject(),
      metadata: {
        employeeId:
          leaveRequest.employeeId,
        policyCode:
          leaveRequest.policyCode,
      },
    });

    return res.status(201).json({
      success: true,
      message:
        "Draft leave request created successfully",
      data: leaveRequest,
    });
  } catch (error) {
    console.error(
      "Create leave request error:",
      error
    );

    return sendControllerError(
      res,
      error,
      "Could not create the leave request."
    );
  }
};

const submitLeaveRequest = async (
  req,
  res
) => {
  try {
    const leaveRequest =
      await LeaveRequest.findOne({
        leaveRequestId:
          req.params.leaveRequestId,
      });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message:
          "Leave request was not found.",
      });
    }

    if (
      !canAccessRequest(
        req,
        leaveRequest
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    if (leaveRequest.status !== "Draft") {
      return res.status(409).json({
        success: false,
        message:
          `${leaveRequest.leaveRequestId} must have Draft status before submission.`,
        data: {
          currentStatus:
            leaveRequest.status,
          requiredStatus: "Draft",
        },
      });
    }

    if (
      leaveRequest
        .supportingDocumentsRequired &&
      !leaveRequest.documents.length
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Required supporting documents must be added before this leave request can be submitted.",
        data: {
          documentStatus:
            leaveRequest.documentStatus,
        },
      });
    }

    const beforeValues =
      leaveRequest.toObject();

    leaveRequest.status = "Submitted";
    leaveRequest.submittedAt =
      new Date();
    leaveRequest.submittedBy =
      getUserName(req.user);
    leaveRequest.updatedBy =
      getUserName(req.user);

    appendWorkflow({
      leaveRequest,
      action: "Submitted",
      fromStatus: "Draft",
      toStatus: "Submitted",
      notes:
        req.body.submissionNotes,
      user: req.user,
    });

    await leaveRequest.save();

    await writeAuditLog({
      req,
      action: "SUBMIT_LEAVE_REQUEST",
      module: "HR",
      description:
        `Leave request ${leaveRequest.leaveRequestId} submitted for review.`,
      targetType: "LeaveRequest",
      targetId:
        leaveRequest.leaveRequestId,
      beforeValues,
      afterValues:
        leaveRequest.toObject(),
    });

    return res.json({
      success: true,
      message:
        "Leave request submitted successfully",
      data: leaveRequest,
    });
  } catch (error) {
    console.error(
      "Submit leave request error:",
      error
    );

    return sendControllerError(
      res,
      error,
      "Could not submit the leave request."
    );
  }
};

const approveLeaveRequestByManager =
  async (req, res) => {
    try {
      const leaveRequest =
        await LeaveRequest.findOne({
          leaveRequestId:
            req.params.leaveRequestId,
        });

      if (!leaveRequest) {
        return res.status(404).json({
          success: false,
          message:
            "Leave request was not found.",
        });
      }

      if (
        leaveRequest.status !==
        "Submitted"
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${leaveRequest.leaveRequestId} must have Submitted status before manager approval.`,
          data: {
            currentStatus:
              leaveRequest.status,
            requiredStatus:
              "Submitted",
          },
        });
      }

      const beforeValues =
        leaveRequest.toObject();

      leaveRequest.status =
        "Manager Approved";
      leaveRequest.managerDecision = {
        status: "Approved",
        decidedBy:
          getUserName(req.user),
        decidedByUserId:
          getUserId(req.user),
        decidedAt: new Date(),
        notes: normalizeString(
          req.body.reviewNotes
        ),
      };
      leaveRequest.updatedBy =
        getUserName(req.user);

      appendWorkflow({
        leaveRequest,
        action: "Manager Approved",
        fromStatus: "Submitted",
        toStatus:
          "Manager Approved",
        notes:
          req.body.reviewNotes,
        user: req.user,
      });

      await leaveRequest.save();

      await writeAuditLog({
        req,
        action:
          "MANAGER_APPROVE_LEAVE_REQUEST",
        module: "HR",
        description:
          `Leave request ${leaveRequest.leaveRequestId} manager approved.`,
        targetType: "LeaveRequest",
        targetId:
          leaveRequest.leaveRequestId,
        beforeValues,
        afterValues:
          leaveRequest.toObject(),
      });

      return res.json({
        success: true,
        message:
          "Leave request manager-approved successfully",
        data: leaveRequest,
      });
    } catch (error) {
      console.error(
        "Manager approve leave error:",
        error
      );

      return sendControllerError(
        res,
        error,
        "Could not manager-approve the leave request."
      );
    }
  };

const approveLeaveRequestByHr =
  async (req, res) => {
    const session =
      await mongoose.startSession();

    let approvedRequest = null;
    let beforeValues = null;
    let balanceTransaction = null;

    try {
      await session.withTransaction(
        async () => {
          const leaveRequest =
            await LeaveRequest.findOne({
              leaveRequestId:
                req.params.leaveRequestId,
            }).session(session);

          if (!leaveRequest) {
            const error = new Error(
              "Leave request was not found."
            );

            error.statusCode = 404;
            throw error;
          }

          if (
            leaveRequest.status !==
            "Manager Approved"
          ) {
            const error = new Error(
              `${leaveRequest.leaveRequestId} must have Manager Approved status before HR approval.`
            );

            error.statusCode = 409;
            error.data = {
              currentStatus:
                leaveRequest.status,
              requiredStatus:
                "Manager Approved",
            };
            throw error;
          }

          if (
            leaveRequest
              .supportingDocumentsRequired &&
            leaveRequest.documentStatus !==
              "Verified"
          ) {
            const error = new Error(
              "Required supporting documents must be verified before HR approval."
            );

            error.statusCode = 409;
            error.data = {
              documentStatus:
                leaveRequest.documentStatus,
              requiredStatus:
                "Verified",
            };
            throw error;
          }

          if (
            leaveRequest
              .medicalCertificateRequired &&
            !leaveRequest
              .medicalCertificateReceived
          ) {
            const error = new Error(
              "The required medical certificate must be received before HR approval."
            );

            error.statusCode = 409;
            throw error;
          }

          const employee =
            await HREmployee.findOne({
              employeeId:
                leaveRequest.employeeId,
            }).session(session);

          if (!employee) {
            const error = new Error(
              "The related employee was not found."
            );

            error.statusCode = 404;
            throw error;
          }

          beforeValues =
            leaveRequest.toObject();

          if (
            leaveRequest.balanceEffect ===
              "Deduct" &&
            Number(
              leaveRequest.balanceUnits ||
                0
            ) > 0
          ) {
            if (
              leaveRequest.balanceApplied ||
              leaveRequest
                .balanceTransactionNumber
            ) {
              const error = new Error(
                "The leave balance has already been applied to this request."
              );

              error.statusCode = 409;
              throw error;
            }

            balanceTransaction =
              await postLeaveBalanceTransaction(
                {
                  employee,
                  balanceType:
                    leaveRequest
                      .balanceType,
                  transactionType:
                    "Approved Leave",
                  units:
                    Number(
                      leaveRequest
                        .balanceUnits
                    ) * -1,
                  effectiveDate:
                    leaveRequest
                      .startDate,
                  policy:
                    leaveRequest
                      .policySnapshot,
                  leaveRequestId:
                    leaveRequest
                      .leaveRequestId,
                  sourceType:
                    "Leave Request",
                  sourceReference:
                    leaveRequest
                      .leaveRequestId,
                  reason:
                    `Approved ${leaveRequest.leaveType} leave.`,
                  notes:
                    normalizeString(
                      req.body
                        .approvalNotes
                    ),
                  user: req.user,
                  session,
                }
              );

            leaveRequest.balanceApplied =
              true;
            leaveRequest.balanceAppliedAt =
              new Date();
            leaveRequest.balanceAppliedBy =
              getUserName(req.user);
            leaveRequest.balanceTransactionNumber =
              balanceTransaction.transactionNumber;

            appendWorkflow({
              leaveRequest,
              action: "Balance Applied",
              fromStatus:
                "Manager Approved",
              toStatus:
                "Manager Approved",
              notes:
                `${leaveRequest.balanceUnits} ${leaveRequest.balanceType} day(s) deducted through ${balanceTransaction.transactionNumber}.`,
              user: req.user,
            });
          }

          leaveRequest.status =
            "Approved";
          leaveRequest.hrDecision = {
            status: "Approved",
            decidedBy:
              getUserName(req.user),
            decidedByUserId:
              getUserId(req.user),
            decidedAt: new Date(),
            notes: normalizeString(
              req.body.approvalNotes
            ),
          };
          leaveRequest.approvalNotes =
            normalizeString(
              req.body.approvalNotes
            );
          leaveRequest.adminComment =
            normalizeString(
              req.body.approvalNotes
            );
          leaveRequest.reviewedAt =
            new Date();
          leaveRequest.reviewedBy =
            getUserName(req.user);
          leaveRequest.updatedBy =
            getUserName(req.user);

          appendWorkflow({
            leaveRequest,
            action: "HR Approved",
            fromStatus:
              "Manager Approved",
            toStatus: "Approved",
            notes:
              req.body.approvalNotes,
            user: req.user,
          });

          await leaveRequest.save({
            session,
          });

          approvedRequest =
            leaveRequest;
        }
      );

      await writeAuditLog({
        req,
        action:
          "HR_APPROVE_LEAVE_REQUEST",
        module: "HR",
        description:
          `Leave request ${approvedRequest.leaveRequestId} HR approved.`,
        targetType: "LeaveRequest",
        targetId:
          approvedRequest.leaveRequestId,
        beforeValues,
        afterValues:
          approvedRequest.toObject(),
        metadata: {
          employeeId:
            approvedRequest.employeeId,
          policyCode:
            approvedRequest.policyCode,
          balanceTransactionNumber:
            balanceTransaction
              ?.transactionNumber || "",
          payrollEffect:
            approvedRequest
              .payrollEffect,
        },
      });

      return res.json({
        success: true,
        message:
          "Leave request HR-approved successfully",
        data: {
          leaveRequest:
            approvedRequest,
          balanceTransaction,
        },
      });
    } catch (error) {
      console.error(
        "HR approve leave error:",
        error
      );

      return sendControllerError(
        res,
        error,
        "Could not HR-approve the leave request."
      );
    } finally {
      await session.endSession();
    }
  };

const rejectLeaveRequest = async (
  req,
  res
) => {
  try {
    const rejectionReason =
      normalizeString(
        req.body.rejectionReason ||
          req.body.adminComment
      );

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message:
          "A rejection reason is required.",
      });
    }

    const leaveRequest =
      await LeaveRequest.findOne({
        leaveRequestId:
          req.params.leaveRequestId,
      });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message:
          "Leave request was not found.",
      });
    }

    if (
      ![
        "Submitted",
        "Manager Approved",
      ].includes(leaveRequest.status)
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Only a Submitted or Manager Approved leave request can be rejected.",
        data: {
          currentStatus:
            leaveRequest.status,
        },
      });
    }

    const beforeValues =
      leaveRequest.toObject();
    const previousStatus =
      leaveRequest.status;

    leaveRequest.status = "Rejected";
    leaveRequest.adminComment =
      rejectionReason;
    leaveRequest.reviewedAt =
      new Date();
    leaveRequest.reviewedBy =
      getUserName(req.user);
    leaveRequest.updatedBy =
      getUserName(req.user);

    if (
      previousStatus === "Submitted"
    ) {
      leaveRequest.managerDecision = {
        status: "Rejected",
        decidedBy:
          getUserName(req.user),
        decidedByUserId:
          getUserId(req.user),
        decidedAt: new Date(),
        notes: rejectionReason,
      };
    } else {
      leaveRequest.hrDecision = {
        status: "Rejected",
        decidedBy:
          getUserName(req.user),
        decidedByUserId:
          getUserId(req.user),
        decidedAt: new Date(),
        notes: rejectionReason,
      };
    }

    appendWorkflow({
      leaveRequest,
      action: "Rejected",
      fromStatus: previousStatus,
      toStatus: "Rejected",
      notes: rejectionReason,
      user: req.user,
    });

    await leaveRequest.save();

    await writeAuditLog({
      req,
      action: "REJECT_LEAVE_REQUEST",
      module: "HR",
      description:
        `Leave request ${leaveRequest.leaveRequestId} rejected.`,
      targetType: "LeaveRequest",
      targetId:
        leaveRequest.leaveRequestId,
      beforeValues,
      afterValues:
        leaveRequest.toObject(),
    });

    return res.json({
      success: true,
      message:
        "Leave request rejected successfully",
      data: leaveRequest,
    });
  } catch (error) {
    console.error(
      "Reject leave request error:",
      error
    );

    return sendControllerError(
      res,
      error,
      "Could not reject the leave request."
    );
  }
};

module.exports = {
  getLeaveRequests,
  getLeaveRequestById,
  previewLeaveRequest,
  createLeaveRequest,
  submitLeaveRequest,
  approveLeaveRequestByManager,
  approveLeaveRequestByHr,
  rejectLeaveRequest,
};