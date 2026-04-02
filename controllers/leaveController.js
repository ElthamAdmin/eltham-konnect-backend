const LeaveRequest = require("../models/LeaveRequest");
const HREmployee = require("../models/HREmployee");

const LEAVE_TYPES = ["Vacation", "Sick", "Unpaid", "Emergency"];
const LEAVE_STATUSES = ["Pending", "Approved", "Rejected", "Cancelled"];

const createNextLeaveRequestId = async () => {
  const lastRequest = await LeaveRequest.findOne()
    .sort({ leaveRequestId: -1 })
    .select("leaveRequestId");

  let nextNumber = 1;

  if (lastRequest && lastRequest.leaveRequestId) {
    const lastNumber = parseInt(
      String(lastRequest.leaveRequestId).replace("LR", ""),
      10
    );

    if (!Number.isNaN(lastNumber)) {
      nextNumber = lastNumber + 1;
    }
  }

  return `LR${String(nextNumber).padStart(5, "0")}`;
};

const normalizeString = (value) => String(value || "").trim();

const calculateTotalDays = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end < start) return 0;

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((end - start) / millisecondsPerDay) + 1;
};

const getLeaveRequests = async (req, res) => {
  try {
    const { employeeId, status } = req.query;

    const filter = {};

    if (employeeId) {
      filter.employeeId = employeeId;
    }

    if (status && LEAVE_STATUSES.includes(status)) {
      filter.status = status;
    }

    const leaveRequests = await LeaveRequest.find(filter).sort({
      createdAt: -1,
      _id: -1,
    });

    res.json({
      success: true,
      message: "Leave requests retrieved successfully",
      totalLeaveRequests: leaveRequests.length,
      data: leaveRequests,
    });
  } catch (error) {
    console.error("Error getting leave requests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve leave requests",
      error: error.message,
    });
  }
};

const getLeaveRequestById = async (req, res) => {
  try {
    const { leaveRequestId } = req.params;

    const leaveRequest = await LeaveRequest.findOne({ leaveRequestId });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    res.json({
      success: true,
      message: "Leave request retrieved successfully",
      data: leaveRequest,
    });
  } catch (error) {
    console.error("Error getting leave request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve leave request",
      error: error.message,
    });
  }
};

const createLeaveRequest = async (req, res) => {
  try {
    const {
      employeeId,
      leaveType,
      startDate,
      endDate,
      reason,
    } = req.body;

    if (!employeeId || !leaveType || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Employee, leave type, start date, and end date are required",
      });
    }

    if (!LEAVE_TYPES.includes(leaveType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave type",
      });
    }

    const employee = await HREmployee.findOne({ employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const totalDays = calculateTotalDays(startDate, endDate);

    if (totalDays <= 0) {
      return res.status(400).json({
        success: false,
        message: "End date must be on or after start date",
      });
    }

    const leaveRequestId = await createNextLeaveRequestId();

    const leaveRequest = await LeaveRequest.create({
      leaveRequestId,
      employeeId: employee.employeeId,
      linkedUserId: employee.linkedUserId || "",
      employeeName: employee.fullName,
      department: employee.department || "",
      branch: employee.branch || "",
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason: normalizeString(reason),
      status: "Pending",
      adminComment: "",
      submittedBy: req.user?.email || req.user?.fullName || employee.fullName,
    });

    res.status(201).json({
      success: true,
      message: "Leave request submitted successfully",
      data: leaveRequest,
    });
  } catch (error) {
    console.error("Error creating leave request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create leave request",
      error: error.message,
    });
  }
};

const approveLeaveRequest = async (req, res) => {
  try {
    const { leaveRequestId } = req.params;
    const { adminComment } = req.body;

    const leaveRequest = await LeaveRequest.findOne({ leaveRequestId });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    if (leaveRequest.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending leave requests can be approved",
      });
    }

    const employee = await HREmployee.findOne({ employeeId: leaveRequest.employeeId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee linked to this leave request was not found",
      });
    }

    if (leaveRequest.leaveType === "Vacation") {
      if (Number(employee.leaveBalanceVacation || 0) < leaveRequest.totalDays) {
        return res.status(400).json({
          success: false,
          message: "Employee does not have enough vacation leave balance",
        });
      }

      employee.leaveBalanceVacation =
        Number(employee.leaveBalanceVacation || 0) - leaveRequest.totalDays;
    }

    if (leaveRequest.leaveType === "Sick") {
      if (Number(employee.leaveBalanceSick || 0) < leaveRequest.totalDays) {
        return res.status(400).json({
          success: false,
          message: "Employee does not have enough sick leave balance",
        });
      }

      employee.leaveBalanceSick =
        Number(employee.leaveBalanceSick || 0) - leaveRequest.totalDays;
    }

    await employee.save();

    leaveRequest.status = "Approved";
    leaveRequest.adminComment = normalizeString(adminComment);
    leaveRequest.reviewedAt = new Date();
    leaveRequest.reviewedBy = req.user?.email || req.user?.fullName || "";

    await leaveRequest.save();

    res.json({
      success: true,
      message: "Leave request approved successfully",
      data: leaveRequest,
    });
  } catch (error) {
    console.error("Error approving leave request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to approve leave request",
      error: error.message,
    });
  }
};

const rejectLeaveRequest = async (req, res) => {
  try {
    const { leaveRequestId } = req.params;
    const { adminComment } = req.body;

    const leaveRequest = await LeaveRequest.findOne({ leaveRequestId });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    if (leaveRequest.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending leave requests can be rejected",
      });
    }

    leaveRequest.status = "Rejected";
    leaveRequest.adminComment = normalizeString(adminComment);
    leaveRequest.reviewedAt = new Date();
    leaveRequest.reviewedBy = req.user?.email || req.user?.fullName || "";

    await leaveRequest.save();

    res.json({
      success: true,
      message: "Leave request rejected successfully",
      data: leaveRequest,
    });
  } catch (error) {
    console.error("Error rejecting leave request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject leave request",
      error: error.message,
    });
  }
};

module.exports = {
  getLeaveRequests,
  getLeaveRequestById,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
};