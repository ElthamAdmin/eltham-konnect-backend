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

    if (email) {
      const existingEmployeeByEmail = await HREmployee.findOne({
        email: String(email).trim().toLowerCase(),
      });

      if (existingEmployeeByEmail) {
        return res.status(400).json({
          success: false,
          message: "An employee with that email already exists",
        });
      }
    }

    if (linkedUserId) {
      const existingUser = await SystemUser.findOne({ userId: linkedUserId });

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: "Linked system user not found",
        });
      }

      const alreadyLinkedEmployee = await HREmployee.findOne({ linkedUserId });

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
      fullName: String(fullName).trim(),
      firstName: firstName ? String(firstName).trim() : "",
      lastName: lastName ? String(lastName).trim() : "",
      gender: gender || "",
      dateOfBirth: dateOfBirth || "",
      trn: trn ? String(trn).trim() : "",
      nisNumber: nisNumber ? String(nisNumber).trim() : "",
      email: email ? String(email).trim().toLowerCase() : "",
      phone: phone ? String(phone).trim() : "",
      alternatePhone: alternatePhone ? String(alternatePhone).trim() : "",
      address: address ? String(address).trim() : "",
      emergencyContactName: emergencyContactName
        ? String(emergencyContactName).trim()
        : "",
      emergencyContactPhone: emergencyContactPhone
        ? String(emergencyContactPhone).trim()
        : "",
      emergencyContactRelationship: emergencyContactRelationship
        ? String(emergencyContactRelationship).trim()
        : "",
      department: department ? String(department).trim() : "Operations",
      jobTitle: String(jobTitle).trim(),
      branch: branch ? String(branch).trim() : "Eltham Park Mainstore",
      employmentType: employmentType || "Temporary",
      startDate: startDate || "",
      endDate: endDate || "",
      employmentStatus: employmentStatus || "Active",
      payType: payType || "Monthly Salary",
      payRate: Number(payRate || 0),
      payrollEnabled:
        payrollEnabled === false || payrollEnabled === "false" ? false : true,
      linkedUserId: linkedUserId ? String(linkedUserId).trim() : "",
      attendanceRequired:
        attendanceRequired === false || attendanceRequired === "false"
          ? false
          : true,
      leaveBalanceVacation: Number(leaveBalanceVacation || 0),
      leaveBalanceSick: Number(leaveBalanceSick || 0),
      leaveBalanceUnpaid: Number(leaveBalanceUnpaid || 0),
      notes: notes ? String(notes).trim() : "",
      createdBy: req.user?.email || req.user?.fullName || "",
      updatedBy: req.user?.email || req.user?.fullName || "",
    });

    if (linkedUserId) {
      await SystemUser.findOneAndUpdate(
        { userId: linkedUserId },
        {
          fullName: employee.fullName,
          email: employee.email || undefined,
          phone: employee.phone || undefined,
          branch: employee.branch,
          linkedEmployeeId: employee.employeeId,
        }
      );
    }

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
      const normalizedEmail = String(updates.email).trim().toLowerCase();

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

    if (updates.linkedUserId) {
      const existingUser = await SystemUser.findOne({
        userId: updates.linkedUserId,
      });

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: "Linked system user not found",
        });
      }

      const alreadyLinkedEmployee = await HREmployee.findOne({
        linkedUserId: updates.linkedUserId,
        employeeId: { $ne: employeeId },
      });

      if (alreadyLinkedEmployee) {
        return res.status(400).json({
          success: false,
          message: "That system user is already linked to another employee",
        });
      }
    }

    updates.updatedBy = req.user?.email || req.user?.fullName || employee.updatedBy;

    const updatedEmployee = await HREmployee.findOneAndUpdate(
      { employeeId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (updatedEmployee.linkedUserId) {
      await SystemUser.findOneAndUpdate(
        { userId: updatedEmployee.linkedUserId },
        {
          fullName: updatedEmployee.fullName,
          email: updatedEmployee.email || undefined,
          phone: updatedEmployee.phone || undefined,
          branch: updatedEmployee.branch,
          linkedEmployeeId: updatedEmployee.employeeId,
        }
      );
    }

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