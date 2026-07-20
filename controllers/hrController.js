const HREmployee = require("../models/HREmployee");
const SystemUser = require("../models/SystemUser");

const createNextEmployeeId = async () => {
  const lastEmployee = await HREmployee.findOne()
    .sort({ employeeId: -1 })
    .select("employeeId");

  let nextNumber = 1;

  if (lastEmployee && lastEmployee.employeeId) {
    const lastNumber = parseInt(
      String(lastEmployee.employeeId).replace("EMP", ""),
      10
    );

    if (!Number.isNaN(lastNumber)) {
      nextNumber = lastNumber + 1;
    }
  }

  return `EMP${String(nextNumber).padStart(5, "0")}`;
};

const normalizeString = (value) => String(value || "").trim();
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const getUserName = (user) =>
  user?.fullName ||
  user?.name ||
  user?.email ||
  "System User";

  const EMPLOYEE_MASTER_RESPONSE_EXCLUSIONS =
  "-documents -disciplineRecords -performanceReviews";

const toBoolean = (value, defaultValue = true) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return defaultValue;
};

const syncLinkedSystemUser = async (employee) => {
  if (!employee.linkedUserId) return;

  await SystemUser.findOneAndUpdate(
    { userId: employee.linkedUserId },
    {
      fullName: employee.fullName,
      email: employee.email || undefined,
      phone: employee.phone || undefined,
      branch: employee.branch,
      linkedEmployeeId: employee.employeeId,
    }
  );
};

const clearOldLinkedSystemUser = async (linkedUserId, employeeId) => {
  if (!linkedUserId) return;

  await SystemUser.findOneAndUpdate(
    {
      userId: linkedUserId,
      linkedEmployeeId: employeeId,
    },
    {
      linkedEmployeeId: "",
    }
  );
};

const getLinkedUserDetails = async (linkedUserId) => {
  if (!linkedUserId) {
    return {
      linkedUserId: "",
      linkedUserName: "",
      linkedUserRole: "",
    };
  }

  const existingUser = await SystemUser.findOne({ userId: linkedUserId });

  if (!existingUser) {
    return null;
  }

  return {
    linkedUserId: existingUser.userId || "",
    linkedUserName: existingUser.fullName || "",
    linkedUserRole: existingUser.role || "",
  };
};

const getReportsToDetails = async (reportsToEmployeeId) => {
  const normalizedManagerId = normalizeString(reportsToEmployeeId);

  if (!normalizedManagerId) {
    return {
      reportsToEmployeeId: "",
      reportsToName: "",
    };
  }

  const manager = await HREmployee.findOne({
    employeeId: normalizedManagerId,
  });

  if (!manager) {
    return null;
  }

  return {
    reportsToEmployeeId: manager.employeeId || "",
    reportsToName: manager.fullName || "",
  };
};

const buildOrgChart = (employees) => {
  const map = {};
  const roots = [];

  employees.forEach((employee) => {
    map[employee.employeeId] = {
      employeeId: employee.employeeId,
      fullName: employee.fullName,
      jobTitle: employee.jobTitle,
      department: employee.department,
      branch: employee.branch,
      jobLevel: Number(employee.jobLevel || 1),
      isDepartmentHead: Boolean(employee.isDepartmentHead),
      reportsToEmployeeId: employee.reportsToEmployeeId || "",
      reportsToName: employee.reportsToName || "",
      employmentStatus: employee.employmentStatus || "",
      children: [],
    };
  });

  employees.forEach((employee) => {
    const currentNode = map[employee.employeeId];
    const parentId = employee.reportsToEmployeeId || "";

    if (parentId && map[parentId]) {
      map[parentId].children.push(currentNode);
    } else {
      roots.push(currentNode);
    }
  });

  const sortTree = (nodes) => {
    nodes.sort((a, b) => {
      if (a.jobLevel !== b.jobLevel) {
        return b.jobLevel - a.jobLevel;
      }
      return String(a.fullName || "").localeCompare(String(b.fullName || ""));
    });

    nodes.forEach((node) => sortTree(node.children));
  };

  sortTree(roots);
  return roots;
};

const getEmployees = async (req, res) => {
  try {
    let employees;

    const isAdmin =
      req.user?.role === "Admin" ||
      (req.user?.permissions || []).includes("hr");

    if (isAdmin) {
      // Admin → see all employees
            employees = await HREmployee.find()
        .select(
          EMPLOYEE_MASTER_RESPONSE_EXCLUSIONS
        )
        .sort({
          createdAt: -1,
          _id: -1,
        });
    } else {
      // Staff → ONLY their own record
            employees = await HREmployee.find({
        linkedUserId: req.user?.userId,
      }).select(
        EMPLOYEE_MASTER_RESPONSE_EXCLUSIONS
      );
    }

    res.json({
      success: true,
      message: "HR employees retrieved successfully",
      totalEmployees: employees.length,
      data: employees,
    });
  } catch (error) {
    console.error("Error getting HR employees:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve HR employees",
      error: error.message,
    });
  }
};

const getEmployeeByEmployeeId = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const employee = await HREmployee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "HR employee not found",
      });
    }

    res.json({
      success: true,
      message: "HR employee retrieved successfully",
      data: employee,
    });
  } catch (error) {
    console.error("Error getting HR employee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve HR employee",
      error: error.message,
    });
  }
};

const getMyEmployeeProfile = async (req, res) => {
  try {
    const linkedEmployeeId = req.user?.linkedEmployeeId || "";
    const userId = req.user?.userId || "";

    let employee = null;

    if (linkedEmployeeId) {
            employee = await HREmployee.findOne({
        employeeId: linkedEmployeeId,
      }).select(
        EMPLOYEE_MASTER_RESPONSE_EXCLUSIONS
      );
    }

    if (!employee && userId) {
            employee = await HREmployee.findOne({
        linkedUserId: userId,
      }).select(
        EMPLOYEE_MASTER_RESPONSE_EXCLUSIONS
      );
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "No HR employee profile is linked to this user",
      });
    }

    res.json({
      success: true,
      message: "My HR profile retrieved successfully",
      data: employee,
    });
  } catch (error) {
    console.error("Error getting my HR profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve my HR profile",
      error: error.message,
    });
  }
};
const createEmployee = async (req, res) => {
  try {
    const {
      fullName,
      firstName,
      lastName,
      gender,
      dateOfBirth,
      trn,
      nisNumber,
      email,
      phone,
      alternatePhone,
      address,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelationship,
      department,
      jobTitle,
      jobLevel,
      isDepartmentHead,
      reportsToEmployeeId,
      branch,
            employmentType,
      employmentClassification,
      contractType,
      startDate,
      endDate,
      probation = {},
      normalWorkingHours = {},
      scheduledWorkdays = [],
      employmentStatus,
      payType,
      payRate,
      compensationType,
      payFrequency,
      payrollEnabled,
      payrollEligibilityStatus,
      payrollEligibilityReason,
      payrollEligibilityEffectiveFrom,
      payrollEligibilityEffectiveTo,
      linkedUserId,
      attendanceRequired,
      leaveBalanceVacation,
      leaveBalanceSick,
      leaveBalanceUnpaid,
      notes,
    } = req.body;

    if (!fullName || !jobTitle) {
      return res.status(400).json({
        success: false,
        message: "Full name and job title are required",
      });
    }

    const normalizedEmail = email ? normalizeEmail(email) : "";

    if (normalizedEmail) {
      const existingEmployeeByEmail = await HREmployee.findOne({
        email: normalizedEmail,
      });

      if (existingEmployeeByEmail) {
        return res.status(400).json({
          success: false,
          message: "An employee with that email already exists",
        });
      }
    }

    let linkedUserDetails = {
      linkedUserId: "",
      linkedUserName: "",
      linkedUserRole: "",
    };

    let reportsToDetails = {
  reportsToEmployeeId: "",
  reportsToName: "",
};

    if (linkedUserId) {
      linkedUserDetails = await getLinkedUserDetails(normalizeString(linkedUserId));

      if (!linkedUserDetails) {
        return res.status(404).json({
          success: false,
          message: "Linked system user not found",
        });
      }

      const alreadyLinkedEmployee = await HREmployee.findOne({
        linkedUserId: linkedUserDetails.linkedUserId,
      });

      if (alreadyLinkedEmployee) {
        return res.status(400).json({
          success: false,
          message: "That system user is already linked to another employee",
        });
      }
    }

    if (reportsToEmployeeId) {
  reportsToDetails = await getReportsToDetails(reportsToEmployeeId);

  if (!reportsToDetails) {
    return res.status(404).json({
      success: false,
      message: "Selected reporting manager not found",
    });
  }
}

    const employeeId = await createNextEmployeeId();

    const employee = await HREmployee.create({
      employeeId,
      fullName: normalizeString(fullName),
      firstName: normalizeString(firstName),
      lastName: normalizeString(lastName),
      gender: gender || "",
      dateOfBirth: dateOfBirth || "",
      trn: normalizeString(trn),
      nisNumber: normalizeString(nisNumber),
      email: normalizedEmail,
      phone: normalizeString(phone),
      alternatePhone: normalizeString(alternatePhone),
      address: normalizeString(address),
      emergencyContactName: normalizeString(emergencyContactName),
      emergencyContactPhone: normalizeString(emergencyContactPhone),
      emergencyContactRelationship: normalizeString(emergencyContactRelationship),
      department: normalizeString(department) || "Operations",
      jobTitle: normalizeString(jobTitle),
      jobLevel: Number(jobLevel || 1),
      isDepartmentHead: toBoolean(isDepartmentHead, false),
      reportsToEmployeeId: reportsToDetails.reportsToEmployeeId,
      reportsToName: reportsToDetails.reportsToName,
      branch: normalizeString(branch) || "Eltham Park Mainstore",
            employmentType:
        normalizeString(employmentType) ||
        "Temporary",

      employmentClassification:
        normalizeString(
          employmentClassification
        ),

      contractType:
        normalizeString(contractType),

      startDate:
        normalizeString(startDate),

      endDate:
        normalizeString(endDate),

      probation: {
        applicable: toBoolean(
          probation?.applicable,
          false
        ),

        startDate: normalizeString(
          probation?.startDate
        ),

        endDate: normalizeString(
          probation?.endDate
        ),

        durationMonths: Number(
          probation?.durationMonths || 0
        ),

        status:
          normalizeString(
            probation?.status
          ) ||
          (toBoolean(
            probation?.applicable,
            false
          )
            ? "Pending"
            : "Not Applicable"),

        reviewDueDate: normalizeString(
          probation?.reviewDueDate
        ),

        completedDate: normalizeString(
          probation?.completedDate
        ),

        notes: normalizeString(
          probation?.notes
        ),
      },

      normalWorkingHours: {
        hoursPerDay: Number(
          normalWorkingHours?.hoursPerDay || 0
        ),

        hoursPerWeek: Number(
          normalWorkingHours?.hoursPerWeek || 0
        ),
      },

      scheduledWorkdays: Array.isArray(
        scheduledWorkdays
      )
        ? scheduledWorkdays
            .map((day) =>
              normalizeString(day)
            )
            .filter(Boolean)
        : [],

      employmentStatus:
        normalizeString(employmentStatus) ||
        "Active",

      payType:
        normalizeString(payType) ||
        "Monthly Salary",

      payRate: Number(payRate || 0),

      compensationType:
        normalizeString(compensationType),

      payFrequency:
        normalizeString(payFrequency),

      payrollEnabled: toBoolean(
        payrollEnabled,
        true
      ),

      payrollEligibilityStatus:
        normalizeString(
          payrollEligibilityStatus
        ) || "Pending Review",

      payrollEligibilityReason:
        normalizeString(
          payrollEligibilityReason
        ),

      payrollEligibilityEffectiveFrom:
        normalizeString(
          payrollEligibilityEffectiveFrom
        ),

      payrollEligibilityEffectiveTo:
        normalizeString(
          payrollEligibilityEffectiveTo
        ),

      payrollEligibilityReviewedBy:
        normalizeString(
          payrollEligibilityStatus
        ) &&
        normalizeString(
          payrollEligibilityStatus
        ) !== "Pending Review"
          ? req.user?.fullName ||
            req.user?.email ||
            ""
          : "",

      payrollEligibilityReviewedAt:
        normalizeString(
          payrollEligibilityStatus
        ) &&
        normalizeString(
          payrollEligibilityStatus
        ) !== "Pending Review"
          ? new Date()
          : null,

            linkedUserId:
        linkedUserDetails.linkedUserId,
      linkedUserName: linkedUserDetails.linkedUserName,
      linkedUserRole: linkedUserDetails.linkedUserRole,
      attendanceRequired: toBoolean(attendanceRequired, true),
      leaveBalanceVacation: Number(leaveBalanceVacation || 0),
      leaveBalanceSick: Number(leaveBalanceSick || 0),
      leaveBalanceUnpaid: Number(leaveBalanceUnpaid || 0),
      notes: normalizeString(notes),
      createdBy: req.user?.email || req.user?.fullName || "",
      updatedBy: req.user?.email || req.user?.fullName || "",
    });

    await syncLinkedSystemUser(employee);

    res.status(201).json({
      success: true,
      message: "HR employee created successfully",
      data: employee,
    });
    } catch (error) {
    console.error(
      "Error creating HR employee:",
      error
    );

    const statusCode =
      error?.name === "ValidationError"
        ? 400
        : 500;

    res.status(statusCode).json({
      success: false,
      message:
        error?.name === "ValidationError"
          ? "Employee master-record validation failed"
          : "Failed to create HR employee",
      error: error.message,
    });
  }
};

const updateEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const requestBody = req.body || {};

    const employee = await HREmployee.findOne({
      employeeId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "HR employee not found",
      });
    }

    /*
     * Pay rates must be changed through the effective-dated
     * compensation-history workflow. Leave balances must be
     * changed through the controlled leave-adjustment workflow.
     */
    const requestedPayRate =
      requestBody.payRate !== undefined
        ? Number(requestBody.payRate || 0)
        : Number(employee.payRate || 0);

    const requestedPayType =
      requestBody.payType !== undefined
        ? normalizeString(requestBody.payType)
        : employee.payType;

    const payRateChanged =
      requestBody.payRate !== undefined &&
      requestedPayRate !== Number(employee.payRate || 0);

    const payTypeChanged =
      requestBody.payType !== undefined &&
      requestedPayType !== employee.payType;

    if (payRateChanged || payTypeChanged) {
      return res.status(409).json({
        success: false,
        message:
          "Direct pay-rate changes are disabled. Use the effective-dated compensation-history workflow.",
      });
    }

    const protectedLeaveFields = [
      "leaveBalanceVacation",
      "leaveBalanceSick",
      "leaveBalanceUnpaid",
    ];

    const leaveBalanceChangeRequested =
      protectedLeaveFields.some((fieldName) => {
        if (requestBody[fieldName] === undefined) {
          return false;
        }

        return (
          Number(requestBody[fieldName] || 0) !==
          Number(employee[fieldName] || 0)
        );
      });

    if (leaveBalanceChangeRequested) {
      return res.status(409).json({
        success: false,
        message:
          "Direct leave-balance changes are disabled. Use the controlled leave balance-adjustment workflow.",
      });
    }

    /*
     * Only these employee-master fields may be changed through
     * this endpoint. Audit fields, embedded HR records, pay rates,
     * and leave balances are intentionally excluded.
     */
    const allowedFields = [
      "fullName",
      "firstName",
      "lastName",
      "gender",
      "dateOfBirth",
      "trn",
      "nisNumber",
      "email",
      "phone",
      "alternatePhone",
      "address",
      "emergencyContactName",
      "emergencyContactPhone",
      "emergencyContactRelationship",
      "department",
      "jobTitle",
      "jobLevel",
      "isDepartmentHead",
      "reportsToEmployeeId",
      "branch",
      "employmentType",
      "employmentClassification",
      "contractType",
      "startDate",
      "endDate",
      "probation",
      "normalWorkingHours",
      "scheduledWorkdays",
      "employmentStatus",
      "compensationType",
      "payFrequency",
      "payrollEnabled",
      "payrollEligibilityStatus",
      "payrollEligibilityReason",
      "payrollEligibilityEffectiveFrom",
      "payrollEligibilityEffectiveTo",
      "linkedUserId",
      "attendanceRequired",
      "notes",
    ];

    const updates = {};

    allowedFields.forEach((fieldName) => {
      if (requestBody[fieldName] !== undefined) {
        updates[fieldName] =
          requestBody[fieldName];
      }
    });

    const stringFields = [
      "fullName",
      "firstName",
      "lastName",
      "gender",
      "dateOfBirth",
      "trn",
      "nisNumber",
      "phone",
      "alternatePhone",
      "address",
      "emergencyContactName",
      "emergencyContactPhone",
      "emergencyContactRelationship",
      "department",
      "jobTitle",
      "reportsToEmployeeId",
      "branch",
      "employmentType",
      "employmentClassification",
      "contractType",
      "startDate",
      "endDate",
      "employmentStatus",
      "compensationType",
      "payFrequency",
      "payrollEligibilityStatus",
      "payrollEligibilityReason",
      "payrollEligibilityEffectiveFrom",
      "payrollEligibilityEffectiveTo",
      "linkedUserId",
      "notes",
    ];

    stringFields.forEach((fieldName) => {
      if (updates[fieldName] !== undefined) {
        updates[fieldName] =
          normalizeString(updates[fieldName]);
      }
    });

    if (updates.email !== undefined) {
      updates.email = normalizeEmail(
        updates.email
      );

      if (updates.email) {
        const existingEmployeeByEmail =
          await HREmployee.findOne({
            email: updates.email,
            employeeId: {
              $ne: employeeId,
            },
          });

        if (existingEmployeeByEmail) {
          return res.status(400).json({
            success: false,
            message:
              "Another employee already uses that email",
          });
        }
      }
    }

    if (updates.jobLevel !== undefined) {
      const parsedJobLevel = Number(
        updates.jobLevel
      );

      if (
        !Number.isInteger(parsedJobLevel) ||
        parsedJobLevel < 1 ||
        parsedJobLevel > 10
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Job level must be a whole number from 1 through 10.",
        });
      }

      updates.jobLevel = parsedJobLevel;
    }

    if (
      updates.isDepartmentHead !== undefined
    ) {
      updates.isDepartmentHead = toBoolean(
        updates.isDepartmentHead,
        employee.isDepartmentHead
      );
    }

    if (updates.payrollEnabled !== undefined) {
      updates.payrollEnabled = toBoolean(
        updates.payrollEnabled,
        employee.payrollEnabled
      );
    }

    if (
      updates.attendanceRequired !== undefined
    ) {
      updates.attendanceRequired = toBoolean(
        updates.attendanceRequired,
        employee.attendanceRequired
      );
    }

    if (
      updates.normalWorkingHours !== undefined
    ) {
      const suppliedHours =
        updates.normalWorkingHours || {};

      updates.normalWorkingHours = {
        hoursPerDay: Number(
          suppliedHours.hoursPerDay || 0
        ),
        hoursPerWeek: Number(
          suppliedHours.hoursPerWeek || 0
        ),
      };
    }

    if (updates.scheduledWorkdays !== undefined) {
      if (
        !Array.isArray(
          updates.scheduledWorkdays
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Scheduled workdays must be supplied as an array.",
        });
      }

      updates.scheduledWorkdays =
        updates.scheduledWorkdays
          .map((workday) =>
            normalizeString(workday)
          )
          .filter(Boolean);
    }

    if (updates.probation !== undefined) {
      const suppliedProbation =
        updates.probation || {};

      updates.probation = {
        applicable: toBoolean(
          suppliedProbation.applicable,
          false
        ),
        startDate: normalizeString(
          suppliedProbation.startDate
        ),
        endDate: normalizeString(
          suppliedProbation.endDate
        ),
        durationMonths: Number(
          suppliedProbation.durationMonths || 0
        ),
        status: normalizeString(
          suppliedProbation.status
        ),
                reviewDueDate: normalizeString(
          suppliedProbation.reviewDueDate
        ),
        completedDate: normalizeString(
          suppliedProbation.completedDate
        ),
        notes: normalizeString(
          suppliedProbation.notes
        ),
      };
    }

    const oldLinkedUserId =
      employee.linkedUserId || "";

    const nextLinkedUserId =
      updates.linkedUserId !== undefined
        ? updates.linkedUserId
        : oldLinkedUserId;

    if (nextLinkedUserId) {
      const linkedUserDetails =
        await getLinkedUserDetails(
          nextLinkedUserId
        );

      if (!linkedUserDetails) {
        return res.status(404).json({
          success: false,
          message:
            "Linked system user not found",
        });
      }

      const alreadyLinkedEmployee =
        await HREmployee.findOne({
          linkedUserId:
            linkedUserDetails.linkedUserId,
          employeeId: {
            $ne: employeeId,
          },
        });

      if (alreadyLinkedEmployee) {
        return res.status(400).json({
          success: false,
          message:
            "That system user is already linked to another employee",
        });
      }

      updates.linkedUserId =
        linkedUserDetails.linkedUserId;
      updates.linkedUserName =
        linkedUserDetails.linkedUserName;
      updates.linkedUserRole =
        linkedUserDetails.linkedUserRole;
    } else if (
      updates.linkedUserId !== undefined
    ) {
      updates.linkedUserId = "";
      updates.linkedUserName = "";
      updates.linkedUserRole = "";
    }

    const oldReportsToEmployeeId =
      employee.reportsToEmployeeId || "";

    const nextReportsToEmployeeId =
      updates.reportsToEmployeeId !== undefined
        ? updates.reportsToEmployeeId
        : oldReportsToEmployeeId;

    if (nextReportsToEmployeeId) {
      const normalizedSelfId =
        normalizeString(employeeId);

      if (
        nextReportsToEmployeeId ===
        normalizedSelfId
      ) {
        return res.status(400).json({
          success: false,
          message:
            "An employee cannot report to themselves",
        });
      }

      const reportsToDetails =
        await getReportsToDetails(
          nextReportsToEmployeeId
        );

      if (!reportsToDetails) {
        return res.status(404).json({
          success: false,
          message:
            "Selected reporting manager not found",
        });
      }

      updates.reportsToEmployeeId =
        reportsToDetails.reportsToEmployeeId;
      updates.reportsToName =
        reportsToDetails.reportsToName;
    } else if (
      updates.reportsToEmployeeId !== undefined
    ) {
      updates.reportsToEmployeeId = "";
      updates.reportsToName = "";
    }

    const previousEligibilityStatus =
      employee.payrollEligibilityStatus;

    const nextEligibilityStatus =
      updates.payrollEligibilityStatus !==
      undefined
        ? updates.payrollEligibilityStatus
        : previousEligibilityStatus;

        if (
      updates.payrollEligibilityStatus !==
        undefined &&
      nextEligibilityStatus !==
        previousEligibilityStatus &&
      nextEligibilityStatus !==
        "Pending Review"
    ) {
      updates.payrollEligibilityReviewedBy =
        getUserName(req.user);

      updates.payrollEligibilityReviewedAt =
        new Date();
    }

    if (
      nextEligibilityStatus ===
      "Pending Review"
    ) {
      updates.payrollEligibilityReviewedBy =
        "";
      updates.payrollEligibilityReviewedAt =
        null;
    }

    updates.updatedBy =
      getUserName(req.user);

    /*
     * Save the employee document directly so the complete
     * employee-master pre-validation hook executes.
     */
    employee.set(updates);

    const updatedEmployee =
      await employee.save();

    if (
      oldLinkedUserId &&
      oldLinkedUserId !==
        updatedEmployee.linkedUserId
    ) {
      await clearOldLinkedSystemUser(
        oldLinkedUserId,
        employeeId
      );
    }

    await syncLinkedSystemUser(
      updatedEmployee
    );

    return res.json({
      success: true,
      message:
        "HR employee updated successfully",
      data: updatedEmployee,
    });
  } catch (error) {
    console.error(
      "Error updating HR employee:",
      error
    );

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message:
          "Employee master-record validation failed",
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Failed to update HR employee",
      error: error.message,
    });
  }
};

const updateEmployeeStatus = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { employmentStatus } = req.body;

    const validStatuses = ["Active", "Inactive", "On Leave", "Terminated"];

    if (!validStatuses.includes(employmentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employment status",
      });
    }

    const employee = await HREmployee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "HR employee not found",
      });
    }

    employee.employmentStatus = employmentStatus;
    employee.updatedBy = req.user?.email || req.user?.fullName || employee.updatedBy;

    await employee.save();

    if (employee.linkedUserId) {
      await SystemUser.findOneAndUpdate(
        { userId: employee.linkedUserId },
        {
          status:
            employmentStatus === "Active" || employmentStatus === "On Leave"
              ? "Active"
              : "Inactive",
        }
      );
    }

    res.json({
      success: true,
      message: "HR employee status updated successfully",
      data: employee,
    });
  } catch (error) {
    console.error("Error updating HR employee status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update HR employee status",
      error: error.message,
    });
  }
};

const addDisciplineRecord = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const {
      disciplineType,
      subject,
      details,
      actionTaken,
      incidentDate,
      issuedDate,
      employeeAcknowledged,
    } = req.body;

    const employee = await HREmployee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "HR employee not found",
      });
    }

    if (!disciplineType || !subject || !details) {
      return res.status(400).json({
        success: false,
        message: "Discipline type, subject, and details are required",
      });
    }

    const newRecord = {
      recordId: `DIS-${Date.now()}`,
      disciplineType: normalizeString(disciplineType) || "Other",
      subject: normalizeString(subject),
      details: normalizeString(details),
      actionTaken: normalizeString(actionTaken),
      incidentDate: incidentDate || "",
      issuedDate: issuedDate || new Date().toISOString().split("T")[0],
      issuedBy: req.user?.fullName || req.user?.email || "",
      employeeAcknowledged:
        employeeAcknowledged === true || employeeAcknowledged === "true",
      employeeAcknowledgedAt:
        employeeAcknowledged === true || employeeAcknowledged === "true"
          ? new Date()
          : null,
    };

    employee.disciplineRecords = employee.disciplineRecords || [];
    employee.disciplineRecords.unshift(newRecord);
    employee.updatedBy = req.user?.email || req.user?.fullName || employee.updatedBy;

    await employee.save();

    res.status(201).json({
      success: true,
      message: "Discipline record added successfully",
      data: newRecord,
    });
  } catch (error) {
    console.error("Error adding discipline record:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add discipline record",
      error: error.message,
    });
  }
};

const getMyDisciplineRecords = async (req, res) => {
  try {
    const linkedEmployeeId = req.user?.linkedEmployeeId || "";
    const userId = req.user?.userId || "";

    let employee = null;

    if (linkedEmployeeId) {
      employee = await HREmployee.findOne({ employeeId: linkedEmployeeId });
    }

    if (!employee && userId) {
      employee = await HREmployee.findOne({ linkedUserId: userId });
    }

    if (!employee) {
      return res.json({
        success: true,
        message: "No linked discipline records found",
        data: [],
      });
    }

    res.json({
      success: true,
      message: "My discipline records retrieved successfully",
      data: employee.disciplineRecords || [],
    });
  } catch (error) {
    console.error("Error getting my discipline records:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve discipline records",
      error: error.message,
    });
  }
};

const addPerformanceReview = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const {
      reviewPeriod,
      reviewDate,
      rating,
      strengths,
      areasForImprovement,
      goals,
      managerComments,
      employeeComments,
      employeeAcknowledged,
    } = req.body;

    const employee = await HREmployee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "HR employee not found",
      });
    }

    if (!reviewPeriod || !reviewDate || !rating) {
      return res.status(400).json({
        success: false,
        message: "Review period, review date, and rating are required",
      });
    }

    const newReview = {
      reviewId: `REV-${Date.now()}`,
      reviewPeriod: normalizeString(reviewPeriod),
      reviewDate: reviewDate || "",
      rating: normalizeString(rating) || "Good",
      strengths: normalizeString(strengths),
      areasForImprovement: normalizeString(areasForImprovement),
      goals: normalizeString(goals),
      managerComments: normalizeString(managerComments),
      employeeComments: normalizeString(employeeComments),
      reviewedBy: req.user?.fullName || req.user?.email || "",
      employeeAcknowledged:
        employeeAcknowledged === true || employeeAcknowledged === "true",
      employeeAcknowledgedAt:
        employeeAcknowledged === true || employeeAcknowledged === "true"
          ? new Date()
          : null,
    };

    employee.performanceReviews = employee.performanceReviews || [];
    employee.performanceReviews.unshift(newReview);
    employee.updatedBy = req.user?.email || req.user?.fullName || employee.updatedBy;

    await employee.save();

    res.status(201).json({
      success: true,
      message: "Performance review added successfully",
      data: newReview,
    });
  } catch (error) {
    console.error("Error adding performance review:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add performance review",
      error: error.message,
    });
  }
};

const getMyPerformanceReviews = async (req, res) => {
  try {
    const linkedEmployeeId = req.user?.linkedEmployeeId || "";
    const userId = req.user?.userId || "";

    let employee = null;

    if (linkedEmployeeId) {
      employee = await HREmployee.findOne({ employeeId: linkedEmployeeId });
    }

    if (!employee && userId) {
      employee = await HREmployee.findOne({ linkedUserId: userId });
    }

    if (!employee) {
      return res.json({
        success: true,
        message: "No linked performance reviews found",
        data: [],
      });
    }

    res.json({
      success: true,
      message: "My performance reviews retrieved successfully",
      data: employee.performanceReviews || [],
    });
  } catch (error) {
    console.error("Error getting my performance reviews:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve performance reviews",
      error: error.message,
    });
  }
};

const getOrganizationChart = async (req, res) => {
  try {
    const employees = await HREmployee.find().sort({
      jobLevel: -1,
      fullName: 1,
      createdAt: -1,
    });

    const orgChart = buildOrgChart(employees);

    res.json({
      success: true,
      message: "Organization chart retrieved successfully",
      totalEmployees: employees.length,
      data: orgChart,
    });
  } catch (error) {
    console.error("Error getting organization chart:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve organization chart",
      error: error.message,
    });
  }
};

const getEmployeeSummary = async (req, res) => {
  try {
    const employees = await HREmployee.find();

    const totalEmployees = employees.length;
    const activeEmployees = employees.filter(
      (employee) => employee.employmentStatus === "Active"
    ).length;
    const inactiveEmployees = employees.filter(
      (employee) => employee.employmentStatus === "Inactive"
    ).length;
    const onLeaveEmployees = employees.filter(
      (employee) => employee.employmentStatus === "On Leave"
    ).length;
    const terminatedEmployees = employees.filter(
      (employee) => employee.employmentStatus === "Terminated"
    ).length;
    const payrollEnabledEmployees = employees.filter(
      (employee) => employee.payrollEnabled === true
    ).length;

    res.json({
      success: true,
      message: "HR summary retrieved successfully",
      data: {
        totalEmployees,
        activeEmployees,
        inactiveEmployees,
        onLeaveEmployees,
        terminatedEmployees,
        payrollEnabledEmployees,
      },
    });
  } catch (error) {
    console.error("Error getting HR summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve HR summary",
      error: error.message,
    });
  }
};

module.exports = {
  getEmployees,
  getEmployeeByEmployeeId,
  getMyEmployeeProfile,
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
  addDisciplineRecord,
  getMyDisciplineRecords,
  addPerformanceReview,
  getMyPerformanceReviews,
  getOrganizationChart,
  getEmployeeSummary,
};