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

module.exports = {
  getCompensationRecords,
  createCompensationDraft,
  updateCompensationDraft,
};