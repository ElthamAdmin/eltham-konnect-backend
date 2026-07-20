const mongoose = require("mongoose");
const EmployeeCompensation = require(
  "../models/EmployeeCompensation"
);
const HREmployee = require(
  "../models/HREmployee"
);
const {
  writeAuditLog,
} = require("../utils/auditLogger");

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

const normalizeString = (value) =>
  String(value || "").trim();

const createCompensationNumber = () =>
  `COMP-${Date.now()}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;

const buildSafeAuditSnapshot = (
  compensation
) => ({
  compensationNumber:
    compensation.compensationNumber,
  employeeId: compensation.employeeId,
  compensationType:
    compensation.compensationType,
  compensationCategory:
    compensation.compensationCategory,
  componentCode:
    compensation.componentCode,
  rateUnit: compensation.rateUnit,
  payFrequency:
    compensation.payFrequency,
  effectiveFrom:
    compensation.effectiveFrom,
  effectiveTo:
    compensation.effectiveTo || "",
  changeReason:
    compensation.changeReason,
  status: compensation.status,
  amountRecorded:
    Number(compensation.amount || 0) > 0,
});

/*
 * Salary amounts are intentionally excluded
 * from general audit metadata.
 */
const buildChangeAuditMetadata = (
  body = {}
) => ({
  amountChanged:
    body.amount !== undefined,
  effectiveDatesChanged:
    body.effectiveFrom !== undefined ||
    body.effectiveTo !== undefined,
  classificationChanged:
    body.compensationType !==
      undefined ||
    body.componentCode !== undefined ||
    body.componentName !== undefined ||
    body.rateUnit !== undefined ||
    body.payFrequency !== undefined,
  hoursChanged:
    body.standardHoursPerDay !==
      undefined ||
    body.standardHoursPerWeek !==
      undefined,
  supportingReferenceChanged:
    body.supportingDocumentReference !==
      undefined,
});

const getCompensationRecords = async (
  req,
  res
) => {
  try {
    const query = {};

    if (req.query.employeeId) {
      query.employeeId = normalizeString(
        req.query.employeeId
      );
    }

    if (req.query.status) {
      query.status = normalizeString(
        req.query.status
      );
    }

    if (req.query.compensationType) {
      query.compensationType =
        normalizeString(
          req.query.compensationType
        );
    }

    if (req.query.asOfDate) {
      const asOfDate = normalizeString(
        req.query.asOfDate
      );

      query.effectiveFrom = {
        $lte: asOfDate,
      };

      query.$or = [
        {
          effectiveTo: "",
        },
        {
          effectiveTo: {
            $gte: asOfDate,
          },
        },
      ];
    }

    const records =
      await EmployeeCompensation.find(
        query
      ).sort({
        employeeId: 1,
        effectiveFrom: -1,
        createdAt: -1,
      });

    return res.json({
      success: true,
      message:
        "Employee compensation records retrieved successfully",
      totalRecords: records.length,
      data: records,
    });
  } catch (error) {
    console.error(
      "Error retrieving compensation records:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not retrieve employee compensation records",
      error: error.message,
    });
  }
};

const createCompensationDraft = async (
  req,
  res
) => {
  try {
    const {
      employeeId,
      compensationType,
      componentCode,
      componentName,
      amount,
      rateUnit,
      payFrequency,
      standardHoursPerDay,
      standardHoursPerWeek,
      effectiveFrom,
      effectiveTo,
      changeReason,
      changeNotes,
      supportingDocumentReference,
    } = req.body || {};

    const normalizedEmployeeId =
      normalizeString(employeeId);

    if (!normalizedEmployeeId) {
      return res.status(400).json({
        success: false,
        message:
          "An employee is required.",
      });
    }

    const employee =
      await HREmployee.findOne({
        employeeId:
          normalizedEmployeeId,
      });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message:
          "The selected HR employee was not found.",
      });
    }

    const normalizedType =
      normalizeString(compensationType);

    const isAllowance =
      normalizedType === "Allowance";

    const normalizedComponentCode =
      isAllowance
        ? normalizeString(
            componentCode
          ).toUpperCase()
        : "BASE_PAY";

    const normalizedComponentName =
      isAllowance
        ? normalizeString(componentName)
        : `${normalizedType} - Base Pay`;

    if (
      isAllowance &&
      (!normalizedComponentCode ||
        !normalizedComponentName)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Allowance code and allowance name are required.",
      });
    }

    const userName = getUserName(
      req.user
    );

    const record =
      await EmployeeCompensation.create({
        compensationNumber:
          createCompensationNumber(),

        employeeId:
          employee.employeeId,
        employeeNameSnapshot:
          employee.fullName,
        jobTitleSnapshot:
          employee.jobTitle || "",
        departmentSnapshot:
          employee.department || "",
        branchSnapshot:
          employee.branch || "",

        compensationType:
          normalizedType,
        compensationCategory:
          isAllowance
            ? "Recurring Addition"
            : "Base Pay",

        componentCode:
          normalizedComponentCode,
        componentName:
          normalizedComponentName,

        amount: Number(amount || 0),
        currency: "JMD",
        rateUnit:
          normalizeString(rateUnit),
        payFrequency:
          normalizeString(
            payFrequency
          ),

        standardHoursPerDay: Number(
          standardHoursPerDay || 0
        ),
        standardHoursPerWeek: Number(
          standardHoursPerWeek || 0
        ),

        effectiveFrom:
          normalizeString(
            effectiveFrom
          ),
        effectiveTo:
          normalizeString(effectiveTo),

        changeReason:
          normalizeString(
            changeReason
          ),
        changeNotes:
          normalizeString(changeNotes),
        supportingDocumentReference:
          normalizeString(
            supportingDocumentReference
          ),

        status: "Draft",

        workflowHistory: [
          {
            fromStatus: "",
            toStatus: "Draft",
            action:
              "Compensation draft created",
            reason:
              normalizeString(changeReason),
            performedBy: userName,
            performedAt: new Date(),
          },
        ],

        createdBy: userName,
        updatedBy: userName,
      });

    await writeAuditLog({
      req,
      action:
        "CREATE_COMPENSATION_DRAFT",
      module: "HR",
      description:
        `Compensation draft ${record.compensationNumber} created for ${record.employeeId}`,
      targetType:
        "EmployeeCompensation",
      targetId:
        record.compensationNumber,
      afterValues:
        buildSafeAuditSnapshot(record),
      metadata: {
        ...buildChangeAuditMetadata(
          req.body || {}
        ),
        source:
          "Compensation History",
      },
    });

    return res.status(201).json({
      success: true,
      message:
        "Draft employee compensation record created successfully",
      data: record,
    });
  } catch (error) {
    console.error(
      "Error creating compensation draft:",
      error
    );

    const statusCode =
      error?.name ===
      "ValidationError"
        ? 400
        : 500;

    return res
      .status(statusCode)
      .json({
        success: false,
        message:
          statusCode === 400
            ? "Compensation record validation failed"
            : "Could not create the compensation draft",
        error: error.message,
      });
  }
};

const updateCompensationDraft = async (
  req,
  res
) => {
  try {
    const { compensationNumber } =
      req.params;

    const record =
      await EmployeeCompensation.findOne({
        compensationNumber,
      });

    if (!record) {
      return res.status(404).json({
        success: false,
        message:
          "Employee compensation record not found",
      });
    }

    if (record.status !== "Draft") {
      return res.status(409).json({
        success: false,
        message:
          "Only Draft compensation records may be edited. Create a new effective-dated record to change active compensation.",
      });
    }

    const allowedFields = [
      "compensationType",
      "componentCode",
      "componentName",
      "amount",
      "rateUnit",
      "payFrequency",
      "standardHoursPerDay",
      "standardHoursPerWeek",
      "effectiveFrom",
      "effectiveTo",
      "changeReason",
      "changeNotes",
      "supportingDocumentReference",
    ];

    const updates = {};

    allowedFields.forEach(
      (fieldName) => {
        if (
          req.body?.[fieldName] !==
          undefined
        ) {
          updates[fieldName] =
            req.body[fieldName];
        }
      }
    );

    if (
      updates.compensationType !==
      undefined
    ) {
      updates.compensationType =
        normalizeString(
          updates.compensationType
        );
    }

    const nextType =
      updates.compensationType ||
      record.compensationType;

    const isAllowance =
      nextType === "Allowance";

    updates.compensationCategory =
      isAllowance
        ? "Recurring Addition"
        : "Base Pay";

    if (!isAllowance) {
      updates.componentCode =
        "BASE_PAY";
      updates.componentName =
        `${nextType} - Base Pay`;
    } else {
      const nextCode =
        updates.componentCode !==
        undefined
          ? updates.componentCode
          : record.componentCode;

      const nextName =
        updates.componentName !==
        undefined
          ? updates.componentName
          : record.componentName;

      updates.componentCode =
        normalizeString(
          nextCode
        ).toUpperCase();

      updates.componentName =
        normalizeString(nextName);

      if (
        !updates.componentCode ||
        !updates.componentName
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Allowance code and allowance name are required.",
        });
      }
    }

    const numericFields = [
      "amount",
      "standardHoursPerDay",
      "standardHoursPerWeek",
    ];

    numericFields.forEach(
      (fieldName) => {
        if (
          updates[fieldName] !==
          undefined
        ) {
          updates[fieldName] =
            Number(
              updates[fieldName] || 0
            );
        }
      }
    );

    const stringFields = [
      "rateUnit",
      "payFrequency",
      "effectiveFrom",
      "effectiveTo",
      "changeReason",
      "changeNotes",
      "supportingDocumentReference",
    ];

    stringFields.forEach(
      (fieldName) => {
        if (
          updates[fieldName] !==
          undefined
        ) {
          updates[fieldName] =
            normalizeString(
              updates[fieldName]
            );
        }
      }
    );

    const beforeSnapshot =
      buildSafeAuditSnapshot(record);

    record.set(updates);
    record.updatedBy = getUserName(
      req.user
    );

    const updatedRecord =
      await record.save();

    await writeAuditLog({
      req,
      action:
        "UPDATE_COMPENSATION_DRAFT",
      module: "HR",
      description:
        `Compensation draft ${updatedRecord.compensationNumber} updated`,
      targetType:
        "EmployeeCompensation",
      targetId:
        updatedRecord.compensationNumber,
      beforeValues: beforeSnapshot,
      afterValues:
        buildSafeAuditSnapshot(
          updatedRecord
        ),
      metadata: {
        ...buildChangeAuditMetadata(
          req.body || {}
        ),
        source:
          "Compensation History",
      },
    });

    return res.json({
      success: true,
      message:
        "Draft employee compensation record updated successfully",
      data: updatedRecord,
    });
  } catch (error) {
    console.error(
      "Error updating compensation draft:",
      error
    );

    const statusCode =
      error?.name ===
      "ValidationError"
        ? 400
        : 500;

    return res
      .status(statusCode)
      .json({
        success: false,
        message:
          statusCode === 400
            ? "Compensation record validation failed"
            : "Could not update the compensation draft",
        error: error.message,
      });
  }
};

const previousYmdDate = (
  ymdDate
) => {
  const [year, month, day] =
    String(ymdDate)
      .split("-")
      .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  date.setUTCDate(
    date.getUTCDate() - 1
  );

  return date
    .toISOString()
    .slice(0, 10);
};

const activateCompensationRecord =
  async (req, res) => {
    const session =
      await mongoose.startSession();

    let activatedRecord = null;
    let supersededRecord = null;

    try {
      const {
        compensationNumber,
      } = req.params;

      const {
        approvalNotes = "",
      } = req.body || {};

      const userName = getUserName(
        req.user
      );

      await session.withTransaction(
        async () => {
          const record =
            await EmployeeCompensation.findOne(
              {
                compensationNumber,
              }
            ).session(session);

          if (!record) {
            const error = new Error(
              "Employee compensation record not found"
            );
            error.statusCode = 404;
            throw error;
          }

          if (record.status !== "Draft") {
            const error = new Error(
              "Only Draft compensation records may be activated."
            );
            error.statusCode = 409;
            throw error;
          }

          const employee =
            await HREmployee.findOne({
              employeeId:
                record.employeeId,
            }).session(session);

          if (!employee) {
            const error = new Error(
              "The linked HR employee no longer exists."
            );
            error.statusCode = 409;
            throw error;
          }

          if (
            employee.employmentStatus ===
            "Terminated"
          ) {
            const error = new Error(
              "Compensation cannot be activated for a terminated employee."
            );
            error.statusCode = 409;
            throw error;
          }

          const newPeriodEnd =
            record.effectiveTo ||
            "9999-12-31";

          const overlappingRecords =
            await EmployeeCompensation.find(
              {
                _id: {
                  $ne: record._id,
                },
                employeeId:
                  record.employeeId,
                compensationCategory:
                  record.compensationCategory,
                componentCode:
                  record.componentCode,
                status: "Active",
                effectiveFrom: {
                  $lte: newPeriodEnd,
                },
                $or: [
                  {
                    effectiveTo: "",
                  },
                  {
                    effectiveTo: {
                      $gte:
                        record.effectiveFrom,
                    },
                  },
                ],
              }
            )
              .session(session)
              .sort({
                effectiveFrom: -1,
              });

          if (
            overlappingRecords.length > 1
          ) {
            const error = new Error(
              "Multiple overlapping active compensation records exist. Resolve the compensation history before activation."
            );
            error.statusCode = 409;
            throw error;
          }

          const existingActive =
            overlappingRecords[0] ||
            null;

          if (existingActive) {
            if (
              record.effectiveFrom <=
              existingActive.effectiveFrom
            ) {
              const error = new Error(
                `The new effective date must be later than ${existingActive.compensationNumber}, which begins on ${existingActive.effectiveFrom}.`
              );
              error.statusCode = 409;
              throw error;
            }

            const closedDate =
              previousYmdDate(
                record.effectiveFrom
              );

            if (
              closedDate <
              existingActive.effectiveFrom
            ) {
              const error = new Error(
                "The prior compensation period cannot be closed before its effective date."
              );
              error.statusCode = 409;
              throw error;
            }

            existingActive.effectiveTo =
              closedDate;

            existingActive.status =
              "Superseded";

            existingActive
              .replacedByCompensationNumber =
              record.compensationNumber;

            existingActive.updatedBy =
              userName;

            existingActive.workflowHistory.push(
              {
                fromStatus: "Active",
                toStatus:
                  "Superseded",
                action:
                  "Compensation superseded",
                reason:
                  `Replaced by ${record.compensationNumber}`,
                performedBy:
                  userName,
                performedAt:
                  new Date(),
              }
            );

            supersededRecord =
              await existingActive.save({
                session,
              });

            record.replacesCompensationNumber =
              existingActive
                .compensationNumber;
          }

          record.status = "Active";
          record.approvedBy = userName;
          record.approvedAt =
            new Date();
          record.updatedBy = userName;

          record.workflowHistory.push({
            fromStatus: "Draft",
            toStatus: "Active",
            action:
              "Compensation activated",
            reason:
              normalizeString(
                approvalNotes
              ) ||
              "Effective-dated compensation approved",
            performedBy: userName,
            performedAt: new Date(),
          });

          activatedRecord =
            await record.save({
              session,
            });
        }
      );

      await writeAuditLog({
        req,
        action:
          "ACTIVATE_EMPLOYEE_COMPENSATION",
        module: "HR",
        description:
          `Compensation ${activatedRecord.compensationNumber} activated for ${activatedRecord.employeeId}`,
        targetType:
          "EmployeeCompensation",
        targetId:
          activatedRecord.compensationNumber,
        afterValues:
          buildSafeAuditSnapshot(
            activatedRecord
          ),
        metadata: {
          source:
            "Compensation History",
          supersededPriorRecord:
            Boolean(
              supersededRecord
            ),
          supersededCompensationNumber:
            supersededRecord
              ?.compensationNumber || "",
          amountRecorded:
            Number(
              activatedRecord.amount ||
                0
            ) > 0,
          legacyEmployeePayRateChanged:
            false,
        },
      });

      return res.json({
        success: true,
        message:
          supersededRecord
            ? `${activatedRecord.compensationNumber} activated successfully and ${supersededRecord.compensationNumber} was superseded.`
            : `${activatedRecord.compensationNumber} activated successfully.`,
        data: activatedRecord,
        supersededRecord:
          supersededRecord
            ? {
                compensationNumber:
                  supersededRecord
                    .compensationNumber,
                effectiveFrom:
                  supersededRecord
                    .effectiveFrom,
                effectiveTo:
                  supersededRecord
                    .effectiveTo,
                status:
                  supersededRecord.status,
              }
            : null,
      });
    } catch (error) {
      console.error(
        "Error activating compensation:",
        error
      );

      return res
        .status(
          error.statusCode || 500
        )
        .json({
          success: false,
          message:
            error.statusCode
              ? error.message
              : "Could not activate the compensation record",
          error:
            error.statusCode
              ? undefined
              : error.message,
        });
    } finally {
      await session.endSession();
    }
  };

const cancelCompensationDraft =
  async (req, res) => {
    try {
      const {
        compensationNumber,
      } = req.params;

      const cancellationReason =
        normalizeString(
          req.body?.cancellationReason
        );

      if (!cancellationReason) {
        return res.status(400).json({
          success: false,
          message:
            "A cancellation reason is required.",
        });
      }

      const record =
        await EmployeeCompensation.findOne({
          compensationNumber,
        });

      if (!record) {
        return res.status(404).json({
          success: false,
          message:
            "Employee compensation record not found",
        });
      }

      if (record.status !== "Draft") {
        return res.status(409).json({
          success: false,
          message:
            "Only Draft compensation records may be cancelled. Active records must be replaced by a new effective-dated record.",
        });
      }

      const userName = getUserName(
        req.user
      );

      record.status = "Cancelled";
      record.cancelledBy = userName;
      record.cancelledAt =
        new Date();
      record.cancellationReason =
        cancellationReason;
      record.updatedBy = userName;

      record.workflowHistory.push({
        fromStatus: "Draft",
        toStatus: "Cancelled",
        action:
          "Compensation draft cancelled",
        reason:
          cancellationReason,
        performedBy: userName,
        performedAt: new Date(),
      });

      const cancelledRecord =
        await record.save();

      await writeAuditLog({
        req,
        action:
          "CANCEL_COMPENSATION_DRAFT",
        module: "HR",
        description:
          `Compensation draft ${cancelledRecord.compensationNumber} cancelled`,
        targetType:
          "EmployeeCompensation",
        targetId:
          cancelledRecord.compensationNumber,
        afterValues:
          buildSafeAuditSnapshot(
            cancelledRecord
          ),
        metadata: {
          source:
            "Compensation History",
          cancellationReasonRecorded:
            true,
        },
      });

      return res.json({
        success: true,
        message:
          `${cancelledRecord.compensationNumber} cancelled successfully.`,
        data: cancelledRecord,
      });
    } catch (error) {
      console.error(
        "Error cancelling compensation draft:",
        error
      );

      const statusCode =
        error?.name ===
        "ValidationError"
          ? 400
          : 500;

      return res
        .status(statusCode)
        .json({
          success: false,
          message:
            statusCode === 400
              ? "Compensation cancellation validation failed"
              : "Could not cancel the compensation draft",
          error: error.message,
        });
    }
  };

module.exports = {
  getCompensationRecords,
  createCompensationDraft,
  updateCompensationDraft,
  activateCompensationRecord,
  cancelCompensationDraft,
};