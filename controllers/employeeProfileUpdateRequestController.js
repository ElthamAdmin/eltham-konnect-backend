const crypto = require("crypto");

const HREmployee = require("../models/HREmployee");
const SystemUser = require("../models/SystemUser");

const EmployeeProfileUpdateRequest = require(
  "../models/EmployeeProfileUpdateRequest"
);

const {
  writeAuditLog,
} = require("../utils/auditLogger");

const normalizeString = (value) =>
  String(value ?? "").trim();

const normalizeEmail = (value) =>
  normalizeString(value).toLowerCase();

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
  ) || "System User";

const ALLOWED_PROFILE_FIELDS = {
  fullName: {
    label: "Legal Full Name",
    maximumLength: 160,
    normalize: normalizeString,
  },

  gender: {
    label: "Gender",
    maximumLength: 20,
    normalize: normalizeString,
  },

  dateOfBirth: {
    label: "Date of Birth",
    maximumLength: 10,
    normalize: normalizeString,
  },

  trn: {
    label: "TRN",
    maximumLength: 9,
    normalize: (value) =>
      normalizeString(value).replace(/\D/g, ""),
  },

  nisNumber: {
    label: "NIS Number",
    maximumLength: 30,
    normalize: normalizeString,
  },

  email: {
    label: "HR Contact Email",
    maximumLength: 160,
    normalize: normalizeEmail,
  },

  phone: {
    label: "Phone",
    maximumLength: 40,
    normalize: normalizeString,
  },

  alternatePhone: {
    label: "Alternate Phone",
    maximumLength: 40,
    normalize: normalizeString,
  },

  address: {
    label: "Address",
    maximumLength: 500,
    normalize: normalizeString,
  },

  emergencyContactName: {
    label: "Emergency Contact Name",
    maximumLength: 160,
    normalize: normalizeString,
  },

  emergencyContactPhone: {
    label: "Emergency Contact Phone",
    maximumLength: 40,
    normalize: normalizeString,
  },

  emergencyContactRelationship: {
    label: "Emergency Contact Relationship",
    maximumLength: 100,
    normalize: normalizeString,
  },
};

const PROFILE_GENDERS = [
  "",
  "Male",
  "Female",
  "Other",
];

const isValidDateOnly = (value) => {
  if (!value) return true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T12:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
};

const createRequestNumber = (employeeId) =>
  [
    "PROFILE",
    employeeId,
    Date.now(),
    crypto.randomUUID().slice(0, 8).toUpperCase(),
  ].join("-");

const buildEmployeeSnapshot = (employee) => ({
  fullName: normalizeString(employee?.fullName),
  jobTitle: normalizeString(employee?.jobTitle),
  department: normalizeString(employee?.department),
  branch: normalizeString(employee?.branch),
});

const buildProfileSnapshot = (employee) => ({
  fullName: normalizeString(employee?.fullName),
  gender: normalizeString(employee?.gender),
  dateOfBirth: normalizeString(employee?.dateOfBirth),
  trn: normalizeString(employee?.trn),
  nisNumber: normalizeString(employee?.nisNumber),
  email: normalizeString(employee?.email),
  phone: normalizeString(employee?.phone),
  alternatePhone: normalizeString(
    employee?.alternatePhone
  ),
  address: normalizeString(employee?.address),
  emergencyContactName: normalizeString(
    employee?.emergencyContactName
  ),
  emergencyContactPhone: normalizeString(
    employee?.emergencyContactPhone
  ),
  emergencyContactRelationship: normalizeString(
    employee?.emergencyContactRelationship
  ),
});

const findLinkedEmployee = async (user) => {
  const linkedEmployeeId =
    normalizeString(user?.linkedEmployeeId);

  const userId = getUserId(user);

  let employee = null;

  if (linkedEmployeeId) {
    employee = await HREmployee.findOne({
      employeeId: linkedEmployeeId,
    });
  }

  if (!employee && userId) {
    employee = await HREmployee.findOne({
      linkedUserId: userId,
    });
  }

  return employee;
};

const buildRequestedChanges = ({
  employee,
  requestedChanges,
}) => {
  if (
    !requestedChanges ||
    typeof requestedChanges !== "object" ||
    Array.isArray(requestedChanges)
  ) {
    return {
      error:
        "Requested profile changes must be supplied as an object.",
      changes: [],
    };
  }

  const changes = [];

  for (const [
    field,
    configuration,
  ] of Object.entries(
    ALLOWED_PROFILE_FIELDS
  )) {
    if (
      !Object.prototype.hasOwnProperty.call(
        requestedChanges,
        field
      )
    ) {
      continue;
    }

    const requestedValue =
      configuration.normalize(
        requestedChanges[field]
      );

    if (
      requestedValue.length >
      configuration.maximumLength
    ) {
      return {
        error:
          `${configuration.label} must not exceed ` +
          `${configuration.maximumLength} characters.`,
        changes: [],
      };
    }

    if (
      field === "email" &&
      requestedValue &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        requestedValue
      )
    ) {
      return {
        error:
          "A valid HR contact email address is required.",
        changes: [],
      };
    }

        if (
      field === "fullName" &&
      !requestedValue
    ) {
      return {
        error:
          "The employee's legal full name cannot be blank.",
        changes: [],
      };
    }

    if (
      field === "gender" &&
      !PROFILE_GENDERS.includes(
        requestedValue
      )
    ) {
      return {
        error:
          "Gender must be Male, Female, Other or blank.",
        changes: [],
      };
    }

    if (
      field === "dateOfBirth" &&
      !isValidDateOnly(requestedValue)
    ) {
      return {
        error:
          "Date of birth must be a valid date in YYYY-MM-DD format.",
        changes: [],
      };
    }

    if (
      field === "dateOfBirth" &&
      requestedValue &&
      requestedValue >
        new Date().toISOString().slice(0, 10)
    ) {
      return {
        error:
          "Date of birth cannot be in the future.",
        changes: [],
      };
    }

    if (
      field === "trn" &&
      requestedValue &&
      requestedValue.length !== 9
    ) {
      return {
        error:
          "TRN must contain exactly 9 digits.",
        changes: [],
      };
    }

    const currentValue =
      configuration.normalize(
        employee?.[field]
      );

    if (currentValue === requestedValue) {
      continue;
    }

    changes.push({
      field,
      label: configuration.label,
      currentValue,
      requestedValue,
    });
  }

  return {
    error: "",
    changes,
  };
};

const getMyProfileUpdateRequests = async (
  req,
  res
) => {
  try {
    const employee = await findLinkedEmployee(
      req.user
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message:
          "No HR employee profile is linked to this user.",
      });
    }

    const requests =
      await EmployeeProfileUpdateRequest.find({
        employeeId: employee.employeeId,
      }).sort({
        createdAt: -1,
      });

    return res.json({
      success: true,
      message:
        "Your profile-update requests were retrieved successfully.",
      totalRecords: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error(
      "Get my profile-update requests error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to retrieve your profile-update requests.",
    });
  }
};

const getProfileUpdateRequests = async (
  req,
  res
) => {
  try {
    const query = {};

    const status = normalizeString(
      req.query?.status
    );

    const employeeId = normalizeString(
      req.query?.employeeId
    );

    if (status) {
      query.status = status;
    }

    if (employeeId) {
      query.employeeId = employeeId;
    }

    const requests =
      await EmployeeProfileUpdateRequest.find(
        query
      ).sort({
        createdAt: -1,
      });

    return res.json({
      success: true,
      message:
        "Controlled profile-update requests retrieved successfully.",
      totalRecords: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error(
      "Get profile-update requests error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to retrieve profile-update requests.",
    });
  }
};

const createMyProfileUpdateRequest = async (
  req,
  res
) => {
  try {
    const employee = await findLinkedEmployee(
      req.user
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message:
          "No HR employee profile is linked to this user.",
      });
    }

    const reason = normalizeString(
      req.body?.reason
    );

    if (!reason) {
      return res.status(400).json({
        success: false,
        message:
          "A reason for the profile-update request is required.",
      });
    }

    const pendingRequest =
      await EmployeeProfileUpdateRequest.findOne({
        employeeId: employee.employeeId,
        status: "Pending",
      });

    if (pendingRequest) {
      return res.status(409).json({
        success: false,
        message:
          `${pendingRequest.requestNumber} is already awaiting HR review.`,
        data: pendingRequest,
      });
    }

    const {
      error,
      changes,
    } = buildRequestedChanges({
      employee,
      requestedChanges:
        req.body?.requestedChanges,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error,
      });
    }

    if (changes.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "At least one actual profile change is required.",
      });
    }

    const requestedByUserId = getUserId(
      req.user
    );

    const requestedBy = getUserName(
      req.user
    );

    const request =
      await EmployeeProfileUpdateRequest.create({
        requestNumber: createRequestNumber(
          employee.employeeId
        ),

        employeeId: employee.employeeId,

        linkedUserId:
          normalizeString(
            employee.linkedUserId
          ) || requestedByUserId,

        employeeSnapshot:
          buildEmployeeSnapshot(employee),

        changes,

        reason,

        status: "Pending",

        requestedBy,

        requestedByUserId,

        requestedAt: new Date(),

        history: [
          {
            action: "Profile Update Requested",
            fromStatus: "",
            toStatus: "Pending",
            performedBy: requestedBy,
            performedByUserId:
              requestedByUserId,
            performedAt: new Date(),
            notes: reason,
          },
        ],
      });

    await writeAuditLog({
      req,
      action:
        "Employee Profile Update Requested",
      module: "HR",
      description:
        `${request.requestNumber} was submitted for HR review.`,
      targetType:
        "EmployeeProfileUpdateRequest",
      targetId: request.requestNumber,
      metadata: {
        employeeId: employee.employeeId,
        requestedFields: changes.map(
          (change) => change.field
        ),
      },
      afterValues: {
        status: request.status,
        requestedFields: changes.map(
          (change) => change.field
        ),
      },
    });

    return res.status(201).json({
      success: true,
      message:
        "Profile-update request submitted successfully.",
      data: request,
    });
  } catch (error) {
    console.error(
      "Create profile-update request error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to submit the profile-update request.",
    });
  }
};

const reviewProfileUpdateRequest = async (
  req,
  res
) => {
  try {
    const requestNumber = normalizeString(
      req.params?.requestNumber
    );

    const decision = normalizeString(
      req.body?.decision
    );

    const reviewNotes = normalizeString(
      req.body?.reviewNotes
    );

    if (
      !["Approved", "Rejected"].includes(
        decision
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Profile-update decision must be Approved or Rejected.",
      });
    }

    if (!reviewNotes) {
      return res.status(400).json({
        success: false,
        message:
          "HR review notes are required.",
      });
    }

    const request =
      await EmployeeProfileUpdateRequest.findOne({
        requestNumber,
      });

    if (!request) {
      return res.status(404).json({
        success: false,
        message:
          "Controlled profile-update request not found.",
      });
    }

    if (request.status !== "Pending") {
      return res.status(409).json({
        success: false,
        message:
          `${request.requestNumber} is already ${request.status}.`,
      });
    }

    const employee =
      await HREmployee.findOne({
        employeeId: request.employeeId,
      });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message:
          "The employee linked to this request was not found.",
      });
    }

    const beforeValues =
      buildProfileSnapshot(employee);

    if (decision === "Approved") {
      const emailChange =
        request.changes.find(
          (change) =>
            change.field === "email"
        );

      if (emailChange?.requestedValue) {
        const existingEmployee =
          await HREmployee.findOne({
            employeeId: {
              $ne: employee.employeeId,
            },

            email: normalizeEmail(
              emailChange.requestedValue
            ),
          }).select("employeeId");

        if (existingEmployee) {
          return res.status(409).json({
            success: false,
            message:
              "That HR contact email is already assigned to another employee.",
          });
        }
      }

            const linkedUserId =
        normalizeString(
          employee.linkedUserId
        );

      if (
        linkedUserId &&
        emailChange?.requestedValue
      ) {
        const existingSystemUser =
          await SystemUser.findOne({
            userId: {
              $ne: linkedUserId,
            },
            email: normalizeEmail(
              emailChange.requestedValue
            ),
          }).select("userId");

        if (existingSystemUser) {
          return res.status(409).json({
            success: false,
            message:
              "That email address is already assigned to another system user.",
          });
        }
      }

      for (const change of request.changes) {
        if (
          Object.prototype.hasOwnProperty.call(
            ALLOWED_PROFILE_FIELDS,
            change.field
          )
        ) {
          employee[change.field] =
            change.requestedValue;
        }
      }

      await employee.save();
            if (employee.linkedUserId) {
        await SystemUser.findOneAndUpdate(
          {
            userId: employee.linkedUserId,
          },
          {
            fullName: employee.fullName,
            email: employee.email || undefined,
            phone: employee.phone || undefined,
            linkedEmployeeId:
              employee.employeeId,
            employeeSnapshot: {
              jobTitle:
                employee.jobTitle || "",
              department:
                employee.department || "",
            },
          },
          {
            runValidators: true,
          }
        );
      }
    }

    const reviewedByUserId = getUserId(
      req.user
    );

    const reviewedBy = getUserName(
      req.user
    );

    request.status = decision;
    request.reviewedBy = reviewedBy;
    request.reviewedByUserId =
      reviewedByUserId;
    request.reviewedAt = new Date();
    request.reviewNotes = reviewNotes;

    request.history.push({
      action:
        decision === "Approved"
          ? "Profile Update Approved"
          : "Profile Update Rejected",

      fromStatus: "Pending",
      toStatus: decision,
      performedBy: reviewedBy,
      performedByUserId:
        reviewedByUserId,
      performedAt: new Date(),
      notes: reviewNotes,
    });

    await request.save();

    const afterValues =
      buildProfileSnapshot(employee);

    await writeAuditLog({
      req,
      action:
        decision === "Approved"
          ? "Employee Profile Update Approved"
          : "Employee Profile Update Rejected",
      module: "HR",
      description:
        `${request.requestNumber} was ${decision.toLowerCase()} by HR.`,
      targetType:
        "EmployeeProfileUpdateRequest",
      targetId: request.requestNumber,
      metadata: {
        employeeId: request.employeeId,
        decision,
        reviewedFields:
          request.changes.map(
            (change) => change.field
          ),
      },
      beforeValues,
      afterValues:
        decision === "Approved"
          ? afterValues
          : beforeValues,
    });

    return res.json({
      success: true,
      message:
        `${request.requestNumber} ${decision.toLowerCase()} successfully.`,
      data: {
        request,
        employee:
          decision === "Approved"
            ? employee
            : null,
      },
    });
  } catch (error) {
    console.error(
      "Review profile-update request error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to review the profile-update request.",
    });
  }
};

const cancelMyProfileUpdateRequest = async (
  req,
  res
) => {
  try {
    const employee = await findLinkedEmployee(
      req.user
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message:
          "No HR employee profile is linked to this user.",
      });
    }

    const requestNumber = normalizeString(
      req.params?.requestNumber
    );

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

    const authenticatedUserId =
  getUserId(req.user);

const request =
  await EmployeeProfileUpdateRequest.findOne({
    requestNumber,
    employeeId: employee.employeeId,
    linkedUserId: authenticatedUserId,
  });

    if (!request) {
      return res.status(404).json({
        success: false,
        message:
          "Profile-update request not found for your employee profile.",
      });
    }

    if (request.status !== "Pending") {
      return res.status(409).json({
        success: false,
        message:
          "Only a pending profile-update request can be cancelled.",
      });
    }

    const performedBy = getUserName(
      req.user
    );

    const performedByUserId = getUserId(
      req.user
    );

    request.status = "Cancelled";
    request.cancelledAt = new Date();
    request.cancellationReason =
      cancellationReason;

    request.history.push({
      action: "Profile Update Cancelled",
      fromStatus: "Pending",
      toStatus: "Cancelled",
      performedBy,
      performedByUserId,
      performedAt: new Date(),
      notes: cancellationReason,
    });

    await request.save();

    await writeAuditLog({
      req,
      action:
        "Employee Profile Update Cancelled",
      module: "HR",
      description:
        `${request.requestNumber} was cancelled by the employee.`,
      targetType:
        "EmployeeProfileUpdateRequest",
      targetId: request.requestNumber,
      metadata: {
        employeeId: employee.employeeId,
      },
      beforeValues: {
        status: "Pending",
      },
      afterValues: {
        status: "Cancelled",
      },
    });

    return res.json({
      success: true,
      message:
        `${request.requestNumber} cancelled successfully.`,
      data: request,
    });
  } catch (error) {
    console.error(
      "Cancel profile-update request error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to cancel the profile-update request.",
    });
  }
};

module.exports = {
  getMyProfileUpdateRequests,
  getProfileUpdateRequests,
  createMyProfileUpdateRequest,
  reviewProfileUpdateRequest,
  cancelMyProfileUpdateRequest,
};