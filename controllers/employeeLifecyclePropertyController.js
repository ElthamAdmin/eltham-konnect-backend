const EmployeeLifecycleCase = require(
  "../models/EmployeeLifecycleCase"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const VALID_OUTCOMES = [
  "Issued",
  "Returned",
  "Transferred",
  "Lost",
  "Damaged",
  "Not Applicable",
];

const ACTION_OUTCOME_MAP = {
  Issue: [
    "Issued",
    "Lost",
    "Damaged",
    "Not Applicable",
  ],

  Return: [
    "Returned",
    "Lost",
    "Damaged",
    "Not Applicable",
  ],

  Transfer: [
    "Transferred",
    "Lost",
    "Damaged",
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

const findPropertyItem = (
  lifecycleCase,
  propertyNumber
) => {
  const normalizedPropertyNumber =
    normalizeString(
      propertyNumber
    ).toUpperCase();

  return (
    lifecycleCase.propertyItems || []
  ).find(
    (item) =>
      normalizeString(
        item.propertyNumber
      ).toUpperCase() ===
      normalizedPropertyNumber
  );
};

const requiresConditionBefore = (
  outcome
) =>
  [
    "Issued",
    "Transferred",
  ].includes(outcome);

const requiresConditionAfter = (
  outcome
) =>
  [
    "Returned",
    "Damaged",
  ].includes(outcome);

const requiresEvidence = (
  outcome
) =>
  [
    "Issued",
    "Returned",
    "Transferred",
    "Lost",
    "Damaged",
  ].includes(outcome);

const recordPropertyOutcome = async (
  req,
  res
) => {
  try {
    const {
      lifecycleCaseNumber,
      propertyNumber,
    } = req.params;

    const outcome =
      normalizeString(
        req.body?.outcome
      );

    const conditionBefore =
      normalizeString(
        req.body?.conditionBefore
      );

    const conditionAfter =
      normalizeString(
        req.body?.conditionAfter
      );

    const notes =
      normalizeString(
        req.body?.notes
      );

    const evidenceReference =
      normalizeString(
        req.body?.evidenceReference
      );

    if (
      !VALID_OUTCOMES.includes(
        outcome
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Property outcome must be Issued, Returned, Transferred, Lost, Damaged or Not Applicable.",
      });
    }

    if (!notes) {
      return res.status(400).json({
        success: false,
        message:
          "Property outcome notes are required.",
      });
    }

    if (
      requiresConditionBefore(
        outcome
      ) &&
      !conditionBefore
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The property condition before processing is required.",
      });
    }

    if (
      requiresConditionAfter(
        outcome
      ) &&
      !conditionAfter
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The property condition after processing is required.",
      });
    }

    if (
      requiresEvidence(
        outcome
      ) &&
      !evidenceReference
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A property custody evidence reference is required.",
      });
    }

    const lifecycleCase =
      await EmployeeLifecycleCase.findOne({
        lifecycleCaseNumber:
          normalizeString(
            lifecycleCaseNumber
          ).toUpperCase(),
      });

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
          `${lifecycleCase.lifecycleCaseNumber} is ${lifecycleCase.status} and cannot receive property updates.`,
      });
    }

    if (
      ![
        "Approved",
        "In Progress",
        "Blocked",
        "Ready for Completion",
      ].includes(
        lifecycleCase.status
      )
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Property custody may be processed only after the lifecycle case has been approved.",
      });
    }

    const propertyItem =
      findPropertyItem(
        lifecycleCase,
        propertyNumber
      );

    if (!propertyItem) {
      return res.status(404).json({
        success: false,
        message:
          "Controlled lifecycle property item not found.",
      });
    }

    const allowedOutcomes =
      ACTION_OUTCOME_MAP[
        propertyItem.action
      ] || [];

    if (
      !allowedOutcomes.includes(
        outcome
      )
    ) {
      return res.status(409).json({
        success: false,
        message:
          `${propertyItem.action} property action cannot be completed with the ${outcome} outcome.`,
        data: {
          propertyNumber:
            propertyItem.propertyNumber,

          action:
            propertyItem.action,

          allowedOutcomes,
        },
      });
    }

    if (
      propertyItem.status !==
      "Pending"
    ) {
      return res.status(409).json({
        success: false,
        message:
          `${propertyItem.propertyNumber} has already been processed with status ${propertyItem.status}.`,
      });
    }

    const actorName =
      getUserName(req.user);

    const actorUserId =
      getUserId(req.user);

    const processedAt =
      new Date();

    const beforeValues = {
      propertyNumber:
        propertyItem.propertyNumber,

      action:
        propertyItem.action,

      status:
        propertyItem.status,

      conditionBefore:
        propertyItem.conditionBefore,

      conditionAfter:
        propertyItem.conditionAfter,

      issuedAt:
        propertyItem.issuedAt,

      returnedAt:
        propertyItem.returnedAt,

      processedBy:
        propertyItem.processedBy,

      processedByUserId:
        propertyItem.processedByUserId,

      notes:
        propertyItem.notes,

      evidenceReference:
        propertyItem.evidenceReference,
    };

    propertyItem.status =
      outcome;

    if (conditionBefore) {
      propertyItem.conditionBefore =
        conditionBefore;
    }

    if (conditionAfter) {
      propertyItem.conditionAfter =
        conditionAfter;
    }

    if (outcome === "Issued") {
      propertyItem.issuedAt =
        processedAt;
    }

    if (outcome === "Returned") {
      propertyItem.returnedAt =
        processedAt;
    }

    propertyItem.processedBy =
      actorName;

    propertyItem.processedByUserId =
      actorUserId;

    propertyItem.notes =
      notes;

    propertyItem.evidenceReference =
      evidenceReference;

    lifecycleCase.updatedBy =
      actorName;

    lifecycleCase.workflowHistory.push({
      action:
        `Property ${outcome}`,

      fromStatus:
        lifecycleCase.status,

      toStatus:
        lifecycleCase.status,

      notes:
        `${propertyItem.propertyName} (${propertyItem.propertyNumber}) recorded as ${outcome}. ${notes}`,

      performedBy:
        actorName,

      performedByUserId:
        actorUserId,

      performedAt:
        processedAt,
    });

    await lifecycleCase.save();

    const afterValues = {
      propertyNumber:
        propertyItem.propertyNumber,

      propertyName:
        propertyItem.propertyName,

      propertyType:
        propertyItem.propertyType,

      serialNumber:
        propertyItem.serialNumber,

      assetReference:
        propertyItem.assetReference,

      action:
        propertyItem.action,

      status:
        propertyItem.status,

      conditionBefore:
        propertyItem.conditionBefore,

      conditionAfter:
        propertyItem.conditionAfter,

      issuedAt:
        propertyItem.issuedAt,

      returnedAt:
        propertyItem.returnedAt,

      processedBy:
        propertyItem.processedBy,

      processedByUserId:
        propertyItem.processedByUserId,

      notes:
        propertyItem.notes,

      evidenceReference:
        propertyItem.evidenceReference,
    };

    await writeAuditLog({
      req,

      action:
        "Lifecycle Property Outcome Recorded",

      module:
        "HR Employee Lifecycle",

      description:
        `${propertyItem.propertyName} was recorded as ${outcome} for lifecycle case ${lifecycleCase.lifecycleCaseNumber}.`,

      targetType:
        "EmployeeLifecycleCase",

      targetId:
        lifecycleCase.lifecycleCaseNumber,

      metadata: {
        lifecycleCaseNumber:
          lifecycleCase.lifecycleCaseNumber,

        employeeId:
          lifecycleCase.employeeId,

        caseType:
          lifecycleCase.caseType,

        propertyNumber:
          propertyItem.propertyNumber,

        propertyName:
          propertyItem.propertyName,

        propertyAction:
          propertyItem.action,

        propertyOutcome:
          outcome,

        evidenceReference,
      },

      beforeValues,
      afterValues,
    });

    return res.json({
      success: true,
      message:
        `${propertyItem.propertyNumber} recorded as ${outcome} successfully.`,

      data: {
        lifecycleCaseNumber:
          lifecycleCase.lifecycleCaseNumber,

        employeeId:
          lifecycleCase.employeeId,

        caseType:
          lifecycleCase.caseType,

        caseStatus:
          lifecycleCase.status,

        propertyItem,
      },
    });
  } catch (error) {
    console.error(
      "Record lifecycle property outcome error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to record the controlled property outcome.",

      error:
        error.message,
    });
  }
};

module.exports = {
  recordPropertyOutcome,
};