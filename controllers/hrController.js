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

const getEmployees = async (req, res) => {
  try {
    const employees = await HREmployee.find().sort({ createdAt: -1, _id: -1 });

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
      branch,
      employmentType,
      startDate,
      endDate,
      employmentStatus,
      payType,
      payRate,
      payrollEnabled,
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
      branch: normalizeString(branch) || "Eltham Park Mainstore",
      employmentType: employmentType || "Temporary",
      startDate: startDate || "",
      endDate: endDate || "",
      employmentStatus: employmentStatus || "Active",
      payType: payType || "Monthly Salary",
      payRate: Number(payRate || 0),
      payrollEnabled: toBoolean(payrollEnabled, true),
      linkedUserId: linkedUserDetails.linkedUserId,
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
    console.error("Error creating HR employee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create HR employee",
      error: error.message,
    });
  }
};

const updateEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const updates = { ...req.body };

    const employee = await HREmployee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "HR employee not found",
      });
    }

    if (updates.email) {
      const normalizedEmail = normalizeEmail(updates.email);

      const existingEmployeeByEmail = await HREmployee.findOne({
        email: normalizedEmail,
        employeeId: { $ne: employeeId },
      });

      if (existingEmployeeByEmail) {
        return res.status(400).json({
          success: false,
          message: "Another employee already uses that email",
        });
      }

      updates.email = normalizedEmail;
    }

    if (updates.fullName !== undefined) updates.fullName = normalizeString(updates.fullName);
    if (updates.firstName !== undefined) updates.firstName = normalizeString(updates.firstName);
    if (updates.lastName !== undefined) updates.lastName = normalizeString(updates.lastName);
    if (updates.trn !== undefined) updates.trn = normalizeString(updates.trn);
    if (updates.nisNumber !== undefined) updates.nisNumber = normalizeString(updates.nisNumber);
    if (updates.phone !== undefined) updates.phone = normalizeString(updates.phone);
    if (updates.alternatePhone !== undefined)
      updates.alternatePhone = normalizeString(updates.alternatePhone);
    if (updates.address !== undefined) updates.address = normalizeString(updates.address);
    if (updates.emergencyContactName !== undefined)
      updates.emergencyContactName = normalizeString(updates.emergencyContactName);
    if (updates.emergencyContactPhone !== undefined)
      updates.emergencyContactPhone = normalizeString(updates.emergencyContactPhone);
    if (updates.emergencyContactRelationship !== undefined)
      updates.emergencyContactRelationship = normalizeString(
        updates.emergencyContactRelationship
      );
    if (updates.department !== undefined)
      updates.department = normalizeString(updates.department);
    if (updates.jobTitle !== undefined) updates.jobTitle = normalizeString(updates.jobTitle);
    if (updates.branch !== undefined) updates.branch = normalizeString(updates.branch);
    if (updates.notes !== undefined) updates.notes = normalizeString(updates.notes);

    if (updates.payRate !== undefined) {
      updates.payRate = Number(updates.payRate || 0);
    }

    if (updates.leaveBalanceVacation !== undefined) {
      updates.leaveBalanceVacation = Number(updates.leaveBalanceVacation || 0);
    }

    if (updates.leaveBalanceSick !== undefined) {
      updates.leaveBalanceSick = Number(updates.leaveBalanceSick || 0);
    }

    if (updates.leaveBalanceUnpaid !== undefined) {
      updates.leaveBalanceUnpaid = Number(updates.leaveBalanceUnpaid || 0);
    }

    if (updates.payrollEnabled !== undefined) {
      updates.payrollEnabled = toBoolean(updates.payrollEnabled, true);
    }

    if (updates.attendanceRequired !== undefined) {
      updates.attendanceRequired = toBoolean(updates.attendanceRequired, true);
    }

    const oldLinkedUserId = employee.linkedUserId || "";
    const nextLinkedUserId =
      updates.linkedUserId !== undefined
        ? normalizeString(updates.linkedUserId)
        : oldLinkedUserId;

    if (nextLinkedUserId) {
      const linkedUserDetails = await getLinkedUserDetails(nextLinkedUserId);

      if (!linkedUserDetails) {
        return res.status(404).json({
          success: false,
          message: "Linked system user not found",
        });
      }

      const alreadyLinkedEmployee = await HREmployee.findOne({
        linkedUserId: linkedUserDetails.linkedUserId,
        employeeId: { $ne: employeeId },
      });

      if (alreadyLinkedEmployee) {
        return res.status(400).json({
          success: false,
          message: "That system user is already linked to another employee",
        });
      }

      updates.linkedUserId = linkedUserDetails.linkedUserId;
      updates.linkedUserName = linkedUserDetails.linkedUserName;
      updates.linkedUserRole = linkedUserDetails.linkedUserRole;
    } else if (updates.linkedUserId !== undefined) {
      updates.linkedUserId = "";
      updates.linkedUserName = "";
      updates.linkedUserRole = "";
    }

    updates.updatedBy = req.user?.email || req.user?.fullName || employee.updatedBy;

    const updatedEmployee = await HREmployee.findOneAndUpdate(
      { employeeId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (oldLinkedUserId && oldLinkedUserId !== updatedEmployee.linkedUserId) {
      await clearOldLinkedSystemUser(oldLinkedUserId, employeeId);
    }

    await syncLinkedSystemUser(updatedEmployee);

    res.json({
      success: true,
      message: "HR employee updated successfully",
      data: updatedEmployee,
    });
  } catch (error) {
    console.error("Error updating HR employee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update HR employee",
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
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
  getEmployeeSummary,
};