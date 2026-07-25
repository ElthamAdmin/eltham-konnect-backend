const LeavePolicy = require("../models/LeavePolicy");
const { writeAuditLog } = require(
  "../utils/auditLogger"
);

const normalizeString = (value) =>
  String(value || "").trim();

const getUserName = (req) =>
  req.user?.fullName ||
  req.user?.name ||
  req.user?.email ||
  "System User";

const getUserId = (req) =>
  req.user?.userId ||
  req.user?._id ||
  "";

const getJamaicaTodayYmd = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [
      part.type,
      part.value,
    ])
  );

  return `${values.year}-${values.month}-${values.day}`;
};

const buildPolicyPayload = (body = {}) => ({
  policyCode: normalizeString(
    body.policyCode
  ).toUpperCase(),

  policyName: normalizeString(
    body.policyName
  ),

  leaveType: normalizeString(
    body.leaveType
  ),

  jurisdiction:
    normalizeString(
      body.jurisdiction
    ) || "Jamaica",

  legalClassification:
    normalizeString(
      body.legalClassification
    ),

  legalReference: normalizeString(
    body.legalReference
  ),

  policyDescription:
    normalizeString(
      body.policyDescription
    ),

  effectiveFrom: normalizeString(
    body.effectiveFrom
  ),

  effectiveTo: normalizeString(
    body.effectiveTo
  ),

  eligibleEmploymentTypes:
    Array.isArray(
      body.eligibleEmploymentTypes
    )
      ? [
          ...new Set(
            body.eligibleEmploymentTypes
              .map(normalizeString)
              .filter(Boolean)
          ),
        ]
      : [],

  minimumServiceDays: Number(
    body.minimumServiceDays || 0
  ),

  minimumServiceWeeks: Number(
    body.minimumServiceWeeks || 0
  ),

  minimumServiceMonths: Number(
    body.minimumServiceMonths || 0
  ),

  minimumDaysWorked: Number(
    body.minimumDaysWorked || 0
  ),

  payTreatment: normalizeString(
    body.payTreatment
  ),

  payrollEffect: normalizeString(
    body.payrollEffect
  ),

  countsAsPayableAttendance:
    body.countsAsPayableAttendance !==
    false,

  payPercentage: Number(
    body.payPercentage ?? 100
  ),

  employerPaidDays: Number(
    body.employerPaidDays || 0
  ),

    unpaidDaysAvailable: Number(
    body.unpaidDaysAvailable || 0
  ),

  durationUnit:
    normalizeString(
      body.durationUnit
    ) || "Scheduled Days",

  standardDurationUnits: Number(
    body.standardDurationUnits || 0
  ),

  employerPaidDurationUnits:
    Number(
      body.employerPaidDurationUnits ||
        0
    ),

  maximumExtensionUnits: Number(
    body.maximumExtensionUnits || 0
  ),

  nisCoordinationRequired:
    Boolean(
      body.nisCoordinationRequired
    ),

  balanceTracked: Boolean(
    body.balanceTracked
  ),

  balanceType: normalizeString(
    body.balanceType
  ),

  accrualMethod:
    normalizeString(
      body.accrualMethod
    ) || "None",

  annualEntitlementDays: Number(
    body.annualEntitlementDays || 0
  ),

  monthlyAccrualDays: Number(
    body.monthlyAccrualDays || 0
  ),

  daysWorkedPerLeaveDay: Number(
    body.daysWorkedPerLeaveDay || 0
  ),

  maximumBalanceDays: Number(
    body.maximumBalanceDays || 0
  ),

  maximumConsecutiveDays: Number(
    body.maximumConsecutiveDays || 0
  ),

  carryForwardAllowed: Boolean(
    body.carryForwardAllowed
  ),

  maximumCarryForwardDays: Number(
    body.maximumCarryForwardDays || 0
  ),

  negativeBalanceAllowed: Boolean(
    body.negativeBalanceAllowed
  ),

  supportingDocumentsRequired:
    Boolean(
      body.supportingDocumentsRequired
    ),

  documentRequiredAfterDays:
    Number(
      body.documentRequiredAfterDays ||
        0
    ),

  acceptedDocumentTypes:
    Array.isArray(
      body.acceptedDocumentTypes
    )
      ? [
          ...new Set(
            body.acceptedDocumentTypes
              .map(normalizeString)
              .filter(Boolean)
          ),
        ]
      : [],

  medicalCertificateRequired:
    Boolean(
      body.medicalCertificateRequired
    ),

  medicalCertificateRequiredAfterDays:
    Number(
      body
        .medicalCertificateRequiredAfterDays ||
        0
    ),

  advanceNoticeRequired:
    Boolean(
      body.advanceNoticeRequired
    ),

  minimumAdvanceNoticeDays:
    Number(
      body.minimumAdvanceNoticeDays ||
        0
    ),

  managerApprovalRequired:
    body.managerApprovalRequired !==
    false,

  hrApprovalRequired:
    body.hrApprovalRequired !== false,

  employeeAcknowledgementRequired:
    Boolean(
      body.employeeAcknowledgementRequired
    ),

  allowPartialDay: Boolean(
    body.allowPartialDay
  ),

  allowRetrospectiveRequest:
    Boolean(
      body.allowRetrospectiveRequest
    ),

  genderRestriction:
    normalizeString(
      body.genderRestriction
    ) || "None",

  maximumPaidOccurrences:
    Number(
      body.maximumPaidOccurrences || 0
    ),

  sourceName: normalizeString(
    body.sourceName
  ),

  sourceUrl: normalizeString(
    body.sourceUrl
  ),

  sourceVerifiedAt:
    body.sourceVerifiedAt || null,

  notes: normalizeString(
    body.notes
  ),
});

const validateRequiredPolicyFields = (
  payload
) => {
  const requiredFields = [
    ["policyCode", "Policy code"],
    ["policyName", "Policy name"],
    ["leaveType", "Leave type"],
    [
      "legalClassification",
      "Legal classification",
    ],
    [
      "effectiveFrom",
      "Effective-from date",
    ],
    [
      "payTreatment",
      "Pay treatment",
    ],
    [
      "payrollEffect",
      "Payroll effect",
    ],
  ];

  for (const [field, label] of requiredFields) {
    if (!payload[field]) {
      throw new Error(
        `${label} is required.`
      );
    }
  }
};

const getLeavePolicies = async (
  req,
  res
) => {
  try {
    const {
      leaveType,
      status,
      legalClassification,
      asOfDate,
    } = req.query;

    const filter = {};

    if (normalizeString(leaveType)) {
      filter.leaveType =
        normalizeString(leaveType);
    }

    if (normalizeString(status)) {
      filter.status =
        normalizeString(status);
    }

    if (
      normalizeString(
        legalClassification
      )
    ) {
      filter.legalClassification =
        normalizeString(
          legalClassification
        );
    }

    if (normalizeString(asOfDate)) {
      const date =
        normalizeString(asOfDate);

      filter.effectiveFrom = {
        $lte: date,
      };

      filter.$or = [
        {
          effectiveTo: "",
        },
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            $gte: date,
          },
        },
      ];
    }

    const policies =
      await LeavePolicy.find(
        filter
      ).sort({
        leaveType: 1,
        effectiveFrom: -1,
        createdAt: -1,
      });

    return res.json({
      success: true,
      message:
        "Leave policies retrieved successfully",
      totalRecords:
        policies.length,
      data: policies,
    });
  } catch (error) {
    console.error(
      "Get leave policies error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not retrieve leave policies.",
      error: error.message,
    });
  }
};

const createLeavePolicyDraft =
  async (req, res) => {
    try {
      const payload =
        buildPolicyPayload(
          req.body
        );

      validateRequiredPolicyFields(
        payload
      );

      const existing =
        await LeavePolicy.findOne({
          policyCode:
            payload.policyCode,
        });

      if (existing) {
        return res.status(409).json({
          success: false,
          message:
            `Leave policy ${payload.policyCode} already exists.`,
        });
      }

      const policy =
        await LeavePolicy.create({
          ...payload,
          status: "Draft",
          createdBy:
            getUserName(req),
          updatedBy:
            getUserName(req),
        });

      await writeAuditLog({
        req,
        action:
          "CREATE_LEAVE_POLICY_DRAFT",
        module: "HR",
        description:
          `Draft leave policy ${policy.policyCode} created`,
        targetType: "LeavePolicy",
        targetId:
          policy.policyCode,
        afterValues:
          policy.toObject(),
        metadata: {
          leaveType:
            policy.leaveType,
          payTreatment:
            policy.payTreatment,
          effectiveFrom:
            policy.effectiveFrom,
        },
      });

      return res.status(201).json({
        success: true,
        message:
          "Draft leave policy created successfully",
        data: policy,
      });
    } catch (error) {
      console.error(
        "Create leave policy error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not create leave policy.",
      });
    }
  };

const updateLeavePolicyDraft =
  async (req, res) => {
    try {
      const policyCode =
        normalizeString(
          req.params.policyCode
        ).toUpperCase();

      const policy =
        await LeavePolicy.findOne({
          policyCode,
        });

      if (!policy) {
        return res.status(404).json({
          success: false,
          message:
            "Leave policy was not found.",
        });
      }

      if (policy.status !== "Draft") {
        return res.status(409).json({
          success: false,
          message:
            "Only Draft leave policies can be edited.",
        });
      }

      const beforeValues =
        policy.toObject();

      const payload =
        buildPolicyPayload({
          ...policy.toObject(),
          ...req.body,
          policyCode:
            policy.policyCode,
        });

      validateRequiredPolicyFields(
        payload
      );

      Object.assign(policy, {
        ...payload,
        policyCode:
          policy.policyCode,
        updatedBy:
          getUserName(req),
      });

      await policy.save();

      await writeAuditLog({
        req,
        action:
          "UPDATE_LEAVE_POLICY_DRAFT",
        module: "HR",
        description:
          `Draft leave policy ${policy.policyCode} updated`,
        targetType: "LeavePolicy",
        targetId:
          policy.policyCode,
        beforeValues,
        afterValues:
          policy.toObject(),
      });

      return res.json({
        success: true,
        message:
          "Draft leave policy updated successfully",
        data: policy,
      });
    } catch (error) {
      console.error(
        "Update leave policy error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not update leave policy.",
      });
    }
  };

const activateLeavePolicy =
  async (req, res) => {
    try {
      const policyCode =
        normalizeString(
          req.params.policyCode
        ).toUpperCase();

      const {
        approvalNotes = "",
      } = req.body;

      const policy =
        await LeavePolicy.findOne({
          policyCode,
        });

      if (!policy) {
        return res.status(404).json({
          success: false,
          message:
            "Leave policy was not found.",
        });
      }

      if (policy.status !== "Draft") {
        return res.status(409).json({
          success: false,
          message:
            "Only a Draft leave policy can be activated.",
        });
      }

      const overlap =
        await LeavePolicy.findOne({
          _id: {
            $ne: policy._id,
          },
          leaveType:
            policy.leaveType,
          status: "Active",
          effectiveFrom: {
            $lte:
              policy.effectiveTo ||
              "9999-12-31",
          },
          $or: [
            {
              effectiveTo: "",
            },
            {
              effectiveTo: null,
            },
            {
              effectiveTo: {
                $gte:
                  policy.effectiveFrom,
              },
            },
          ],
        });

      if (overlap) {
        return res.status(409).json({
          success: false,
          message:
            `${policy.leaveType} policy ${overlap.policyCode} overlaps the proposed effective period.`,
          data: {
            conflictingPolicyCode:
              overlap.policyCode,
            conflictingEffectiveFrom:
              overlap.effectiveFrom,
            conflictingEffectiveTo:
              overlap.effectiveTo,
          },
        });
      }

      const beforeValues =
        policy.toObject();

      policy.status = "Active";
      policy.approvedBy =
        getUserName(req);
      policy.approvedAt =
        new Date();
      policy.updatedBy =
        getUserName(req);

      if (
        normalizeString(
          approvalNotes
        )
      ) {
        policy.notes = [
          policy.notes,
          `Activation: ${normalizeString(
            approvalNotes
          )}`,
        ]
          .filter(Boolean)
          .join("\n");
      }

      await policy.save();

      await writeAuditLog({
        req,
        action:
          "ACTIVATE_LEAVE_POLICY",
        module: "HR",
        description:
          `Leave policy ${policy.policyCode} activated`,
        targetType: "LeavePolicy",
        targetId:
          policy.policyCode,
        beforeValues,
        afterValues:
          policy.toObject(),
        metadata: {
          leaveType:
            policy.leaveType,
          payTreatment:
            policy.payTreatment,
          effectiveFrom:
            policy.effectiveFrom,
          effectiveTo:
            policy.effectiveTo,
        },
      });

      return res.json({
        success: true,
        message:
          `${policy.policyCode} activated successfully.`,
        data: policy,
      });
    } catch (error) {
      console.error(
        "Activate leave policy error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not activate leave policy.",
      });
    }
  };

const retireLeavePolicy =
  async (req, res) => {
    try {
      const policyCode =
        normalizeString(
          req.params.policyCode
        ).toUpperCase();

      const retirementReason =
        normalizeString(
          req.body.retirementReason
        );

      const effectiveTo =
        normalizeString(
          req.body.effectiveTo
        ) ||
        getJamaicaTodayYmd();

      if (!retirementReason) {
        return res.status(400).json({
          success: false,
          message:
            "A retirement reason is required.",
        });
      }

      const policy =
        await LeavePolicy.findOne({
          policyCode,
        });

      if (!policy) {
        return res.status(404).json({
          success: false,
          message:
            "Leave policy was not found.",
        });
      }

      if (policy.status !== "Active") {
        return res.status(409).json({
          success: false,
          message:
            "Only an Active leave policy can be retired.",
        });
      }

      if (
        effectiveTo <
        policy.effectiveFrom
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Policy retirement date cannot be earlier than its effective-from date.",
        });
      }

      const beforeValues =
        policy.toObject();

      policy.status = "Retired";
      policy.effectiveTo =
        effectiveTo;
      policy.retiredBy =
        getUserName(req);
      policy.retiredAt =
        new Date();
      policy.retirementReason =
        retirementReason;
      policy.updatedBy =
        getUserName(req);

      await policy.save();

      await writeAuditLog({
        req,
        action:
          "RETIRE_LEAVE_POLICY",
        module: "HR",
        description:
          `Leave policy ${policy.policyCode} retired`,
        targetType: "LeavePolicy",
        targetId:
          policy.policyCode,
        beforeValues,
        afterValues:
          policy.toObject(),
        metadata: {
          effectiveTo,
          retirementReason,
        },
      });

      return res.json({
        success: true,
        message:
          `${policy.policyCode} retired successfully.`,
        data: policy,
      });
    } catch (error) {
      console.error(
        "Retire leave policy error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not retire leave policy.",
      });
    }
  };

module.exports = {
  getLeavePolicies,
  createLeavePolicyDraft,
  updateLeavePolicyDraft,
  activateLeavePolicy,
  retireLeavePolicy,
};