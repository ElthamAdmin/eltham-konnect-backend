const crypto = require("crypto");

const HREmployee = require("../models/HREmployee");
const EmployeeLifecycleCase = require(
  "../models/EmployeeLifecycleCase"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const normalizeString = (value) =>
  String(value || "").trim();

const normalizeCaseType = (value) => {
  const normalizedValue = normalizeString(value).toLowerCase();

  if (normalizedValue === "onboarding") {
    return "Onboarding";
  }

  if (normalizedValue === "offboarding") {
    return "Offboarding";
  }

  return "";
};

const normalizeStatus = (value) => {
  const normalizedValue = normalizeString(value).toLowerCase();

  const statuses = {
    draft: "Draft",
    "pending approval": "Pending Approval",
    approved: "Approved",
    "in progress": "In Progress",
    blocked: "Blocked",
    "ready for completion": "Ready for Completion",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return statuses[normalizedValue] || "";
};

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

const createLifecycleCaseNumber = (caseType) => {
  const prefix =
    caseType === "Onboarding"
      ? "ONB"
      : "OFF";

  return `${prefix}-${Date.now()}-${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase()}`;
};

const getEmployeeSnapshot = (employee) => ({
  fullName: normalizeString(employee?.fullName),
  jobTitle: normalizeString(employee?.jobTitle),
  department: normalizeString(employee?.department),
  branch: normalizeString(employee?.branch),
  employmentClassification: normalizeString(
    employee?.employmentClassification ||
      employee?.employmentType
  ),
  employmentStatus: normalizeString(
    employee?.employmentStatus
  ),
  reportsToEmployeeId: normalizeString(
    employee?.reportsToEmployeeId
  ),
  reportsToName: normalizeString(
    employee?.reportsToName
  ),
  payFrequency: normalizeString(
    employee?.payFrequency
  ),
  payrollEnabled: Boolean(
    employee?.payrollEnabled
  ),
});

const createChecklistItem = ({
  itemNumber,
  category,
  title,
  description,
  assignedToRole,
  dueDate,
  required = true,
}) => ({
  itemNumber,
  category,
  title,
  description,
  required,
  status: "Not Started",
  assignedToRole,
  assignedToName: "",
  assignedToUserId: "",
  dueDate,
  completedAt: null,
  completedBy: "",
  completedByUserId: "",
  completionNotes: "",
  blockedReason: "",
  evidenceReferences: [],
});

const buildOnboardingChecklist = ({
  plannedEffectiveDate,
  probationApplicable,
}) => {
  const checklist = [
    createChecklistItem({
      itemNumber: "ONB-001",
      category: "Employment",
      title: "Verify employment terms",
      description:
        "Confirm the employee's job title, department, branch, manager, employment classification and start date.",
      assignedToRole: "HR",
      dueDate: plannedEffectiveDate,
    }),

    createChecklistItem({
      itemNumber: "ONB-002",
      category: "Documents",
      title: "Verify required employment documents",
      description:
        "Confirm that the employment contract, identification and required policy acknowledgements are recorded.",
      assignedToRole: "HR",
      dueDate: plannedEffectiveDate,
    }),

    createChecklistItem({
      itemNumber: "ONB-003",
      category: "System Access",
      title: "Prepare required system access",
      description:
        "Review the employee's role and prepare the required EKOS access without activating it through this checklist.",
      assignedToRole: "IT",
      dueDate: plannedEffectiveDate,
    }),

    createChecklistItem({
      itemNumber: "ONB-004",
      category: "Payroll",
      title: "Confirm payroll eligibility",
      description:
        "Verify compensation, pay frequency and payroll eligibility before the employee enters payroll processing.",
      assignedToRole: "Payroll",
      dueDate: plannedEffectiveDate,
    }),

    createChecklistItem({
      itemNumber: "ONB-005",
      category: "Manager",
      title: "Confirm work schedule and induction",
      description:
        "The employee's manager must confirm the work schedule, reporting arrangements and departmental induction.",
      assignedToRole: "Manager",
      dueDate: plannedEffectiveDate,
    }),

    createChecklistItem({
      itemNumber: "ONB-006",
      category: "Training",
      title: "Complete policy and workplace orientation",
      description:
        "Complete required workplace, safety, policy and role-specific orientation.",
      assignedToRole: "Manager",
      dueDate: plannedEffectiveDate,
    }),

    createChecklistItem({
      itemNumber: "ONB-007",
      category: "Property",
      title: "Record issued company property",
      description:
        "Record any keys, identification cards, equipment, uniforms or other company property issued.",
      assignedToRole: "HR",
      dueDate: plannedEffectiveDate,
    }),
  ];

  if (probationApplicable) {
    checklist.push(
      createChecklistItem({
        itemNumber: "ONB-008",
        category: "Probation",
        title: "Confirm probation review schedule",
        description:
          "Confirm the probation period, review due date and responsible manager.",
        assignedToRole: "HR",
        dueDate: plannedEffectiveDate,
      })
    );
  }

  return checklist;
};

const buildOffboardingChecklist = ({
  plannedEffectiveDate,
}) => [
  createChecklistItem({
    itemNumber: "OFF-001",
    category: "Employment",
    title: "Verify separation authority",
    description:
      "Confirm the approved separation reason, last working date and supporting authority.",
    assignedToRole: "HR",
    dueDate: plannedEffectiveDate,
  }),

  createChecklistItem({
    itemNumber: "OFF-002",
    category: "Manager",
    title: "Complete operational handover",
    description:
      "Confirm handover of duties, outstanding work, records and departmental responsibilities.",
    assignedToRole: "Manager",
    dueDate: plannedEffectiveDate,
  }),

  createChecklistItem({
    itemNumber: "OFF-003",
    category: "System Access",
    title: "Prepare system-access deactivation",
    description:
      "Identify all system access requiring deactivation. Access is not changed until an authorized workflow action is completed.",
    assignedToRole: "IT",
    dueDate: plannedEffectiveDate,
  }),

  createChecklistItem({
    itemNumber: "OFF-004",
    category: "Property",
    title: "Confirm company-property return",
    description:
      "Confirm return of keys, identification cards, equipment, uniforms and other company property.",
    assignedToRole: "HR",
    dueDate: plannedEffectiveDate,
  }),

  createChecklistItem({
    itemNumber: "OFF-005",
    category: "Payroll",
    title: "Review final-payroll requirements",
    description:
      "Coordinate final payroll, approved deductions, leave treatment and other authorized final-pay items.",
    assignedToRole: "Payroll",
    dueDate: plannedEffectiveDate,
  }),

  createChecklistItem({
    itemNumber: "OFF-006",
    category: "Leave",
    title: "Review leave and attendance records",
    description:
      "Confirm outstanding attendance periods and review controlled leave balances before final payroll.",
    assignedToRole: "HR",
    dueDate: plannedEffectiveDate,
  }),

  createChecklistItem({
    itemNumber: "OFF-007",
    category: "Documents",
    title: "Prepare separation documents",
    description:
      "Prepare and verify required separation, acknowledgement and employment-record documents.",
    assignedToRole: "HR",
    dueDate: plannedEffectiveDate,
  }),

  createChecklistItem({
    itemNumber: "OFF-008",
    category: "Exit Interview",
    title: "Complete exit interview",
    description:
      "Record whether an exit interview was offered and preserve the controlled outcome.",
    assignedToRole: "HR",
    dueDate: plannedEffectiveDate,
    required: false,
  }),

  createChecklistItem({
    itemNumber: "OFF-009",
    category: "Compliance",
    title: "Complete final HR compliance review",
    description:
      "Confirm that all required lifecycle records and audit evidence are complete before closure.",
    assignedToRole: "HR",
    dueDate: plannedEffectiveDate,
  }),
];

const buildSystemAccessItems = ({
  caseType,
  employee,
}) => [
  {
    accessItemNumber:
      caseType === "Onboarding"
        ? "ONB-ACCESS-001"
        : "OFF-ACCESS-001",

    systemName: "EKOS",

    action:
      caseType === "Onboarding"
        ? employee?.linkedUserId
          ? "Activate"
          : "Create"
        : "Deactivate",

    status: "Not Requested",

    linkedUserId: normalizeString(
      employee?.linkedUserId
    ),

    requestedAt: null,
    requestedBy: "",
    requestedByUserId: "",
    completedAt: null,
    completedBy: "",
    completedByUserId: "",
    notes:
      "This record coordinates the required access action. It does not itself modify the system-user account.",
  },
];

const getEmployeeLifecycleCases = async (
  req,
  res
) => {
  try {
    const query = {};

    const caseType = normalizeCaseType(
      req.query.caseType
    );

    const status = normalizeStatus(
      req.query.status
    );

    const employeeId = normalizeString(
      req.query.employeeId
    ).toUpperCase();

    if (req.query.caseType && !caseType) {
      return res.status(400).json({
        success: false,
        message:
          "Case type must be Onboarding or Offboarding.",
      });
    }

    if (req.query.status && !status) {
      return res.status(400).json({
        success: false,
        message:
          "The supplied lifecycle-case status is invalid.",
      });
    }

    if (caseType) {
      query.caseType = caseType;
    }

    if (status) {
      query.status = status;
    }

    if (employeeId) {
      query.employeeId = employeeId;
    }

    const records = await EmployeeLifecycleCase.find(
      query
    )
      .sort({
        createdAt: -1,
        lifecycleCaseNumber: -1,
      })
      .lean();

    return res.json({
      success: true,
      message:
        "Controlled employee lifecycle cases retrieved successfully.",
      totalRecords: records.length,
      data: records,
    });
  } catch (error) {
    console.error(
      "Get employee lifecycle cases error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to retrieve controlled employee lifecycle cases.",
      error: error.message,
    });
  }
};

const getEmployeeLifecycleCaseByNumber = async (
  req,
  res
) => {
  try {
    const lifecycleCaseNumber = normalizeString(
      req.params.lifecycleCaseNumber
    ).toUpperCase();

    const record =
      await EmployeeLifecycleCase.findOne({
        lifecycleCaseNumber,
      }).lean();

    if (!record) {
      return res.status(404).json({
        success: false,
        message:
          "Controlled employee lifecycle case not found.",
      });
    }

    return res.json({
      success: true,
      message:
        "Controlled employee lifecycle case retrieved successfully.",
      data: record,
    });
  } catch (error) {
    console.error(
      "Get employee lifecycle case error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to retrieve the controlled employee lifecycle case.",
      error: error.message,
    });
  }
};

const createEmployeeLifecycleCaseDraft = async (
  req,
  res
) => {
  try {
    const employeeId = normalizeString(
      req.body.employeeId
    ).toUpperCase();

    const caseType = normalizeCaseType(
      req.body.caseType
    );

    const reason = normalizeString(
      req.body.reason
    );

    const plannedEffectiveDate = normalizeString(
      req.body.plannedEffectiveDate
    );

    const expectedStartDate = normalizeString(
      req.body.expectedStartDate ||
        plannedEffectiveDate
    );

    const lastWorkingDate = normalizeString(
      req.body.lastWorkingDate ||
        plannedEffectiveDate
    );

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "An employee ID is required.",
      });
    }

    if (!caseType) {
      return res.status(400).json({
        success: false,
        message:
          "Case type must be Onboarding or Offboarding.",
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message:
          "A lifecycle-case reason is required.",
      });
    }

    if (!plannedEffectiveDate) {
      return res.status(400).json({
        success: false,
        message:
          "A planned effective date is required.",
      });
    }

    const employee = await HREmployee.findOne({
      employeeId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found.",
      });
    }

    const existingOpenCase =
      await EmployeeLifecycleCase.findOne({
        employeeId,
        caseType,
        status: {
          $nin: [
            "Completed",
            "Cancelled",
          ],
        },
      }).lean();

    if (existingOpenCase) {
      return res.status(409).json({
        success: false,
        message:
          `${employee.fullName} already has an open ${caseType.toLowerCase()} case.`,
        data: {
          lifecycleCaseNumber:
            existingOpenCase.lifecycleCaseNumber,
          status: existingOpenCase.status,
        },
      });
    }

    const performedBy = getUserName(
      req.user
    );

    const performedByUserId = getUserId(
      req.user
    );

    const probationApplicable =
      caseType === "Onboarding" &&
      Boolean(employee?.probation?.applicable);

    const checklistItems =
      caseType === "Onboarding"
        ? buildOnboardingChecklist({
            plannedEffectiveDate,
            probationApplicable,
          })
        : buildOffboardingChecklist({
            plannedEffectiveDate,
          });

    const lifecycleCaseNumber =
      createLifecycleCaseNumber(caseType);

    const record =
      await EmployeeLifecycleCase.create({
        lifecycleCaseNumber,
        caseType,
        employeeId,
        linkedUserId: normalizeString(
          employee.linkedUserId
        ),
        employeeSnapshot:
          getEmployeeSnapshot(employee),

        reason,
        plannedEffectiveDate,

        expectedStartDate:
          caseType === "Onboarding"
            ? expectedStartDate
            : "",

        lastWorkingDate:
          caseType === "Offboarding"
            ? lastWorkingDate
            : "",

        status: "Draft",

        managerApproval: {
          required: true,
          status: "Pending",
          decidedBy: "",
          decidedByUserId: "",
          decidedAt: null,
          notes: "",
        },

        hrApproval: {
          required: true,
          status: "Pending",
          decidedBy: "",
          decidedByUserId: "",
          decidedAt: null,
          notes: "",
        },

        checklistItems,

        systemAccessItems:
          buildSystemAccessItems({
            caseType,
            employee,
          }),

        propertyItems: [],

        probationCoordination: {
          required: probationApplicable,

          status: probationApplicable
            ? "Pending"
            : "Not Required",

          startDate:
            probationApplicable
              ? normalizeString(
                  employee?.probation
                    ?.startDate
                )
              : "",

          endDate:
            probationApplicable
              ? normalizeString(
                  employee?.probation
                    ?.endDate
                )
              : "",

          reviewDueDate:
            probationApplicable
              ? normalizeString(
                  employee?.probation
                    ?.reviewDueDate
                )
              : "",

          performanceReviewNumber: "",
          notes: "",
        },

        finalPayroll: {
          required:
            caseType === "Offboarding",

          status:
            caseType === "Offboarding"
              ? "Pending Review"
              : "Not Required",

          payrollNumber: "",
          payrollStatus: "",
          reviewedAt: null,
          reviewedBy: "",
          reviewedByUserId: "",
          notes:
            caseType === "Offboarding"
              ? "Final-payroll coordination is pending. This lifecycle case does not calculate or post payroll."
              : "",
        },

        createdBy: performedBy,
        createdByUserId: performedByUserId,
        updatedBy: performedBy,

        workflowHistory: [
          {
            action: "Draft Created",
            fromStatus: "",
            toStatus: "Draft",
            performedBy,
            performedByUserId,
            performedAt: new Date(),
            notes:
              `Controlled ${caseType.toLowerCase()} draft created with ${checklistItems.length} generated checklist items.`,
          },
        ],
      });

    await writeAuditLog({
      req,
      action:
        "Employee Lifecycle Draft Created",
      module: "HR",
      description:
        `${lifecycleCaseNumber} was created for ${employee.fullName}.`,
      targetType:
        "EmployeeLifecycleCase",
      targetId: lifecycleCaseNumber,
      metadata: {
        lifecycleCaseNumber,
        employeeId,
        caseType,
        plannedEffectiveDate,
        checklistItemCount:
          checklistItems.length,
      },
      afterValues: {
        status: record.status,
        caseType: record.caseType,
        employeeId: record.employeeId,
      },
    });

    return res.status(201).json({
      success: true,
      message:
        `Controlled ${caseType.toLowerCase()} draft created successfully.`,
      data: record,
    });
  } catch (error) {
    console.error(
      "Create employee lifecycle case error:",
      error
    );

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A lifecycle case with this number already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Failed to create the controlled employee lifecycle draft.",
      error: error.message,
    });
  }
};

module.exports = {
  getEmployeeLifecycleCases,
  getEmployeeLifecycleCaseByNumber,
  createEmployeeLifecycleCaseDraft,
};