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

const isAdmin = (req) =>
  req.user?.role === "Admin" ||
  (req.user?.permissions || []).includes("hr");

/**
 * 🔒 SECURE: GET LEAVE REQUESTS
 * - Admin → sees all
 * - Staff → sees ONLY their own
 */
const getLeaveRequests = async (req, res) => {
  try {
    let filter = {};

    if (!isAdmin(req)) {
      // STAFF → only their own leave requests
      filter.linkedUserId = req.user?.userId;
    } else {
      // ADMIN → optional filters
      const { employeeId, status } = req.query;

      if (employeeId) filter.employeeId = employeeId;
      if (status && LEAVE_STATUSES.includes(status)) {
        filter.status = status;
      }
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

/**
 * 🔒 SECURE: GET SINGLE REQUEST
 */
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

    // STAFF cannot access other people's requests
    if (!isAdmin(req)) {
      if (leaveRequest.linkedUserId !== req.user?.userId) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
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

/**
 * 🔒 SECURE: CREATE LEAVE REQUEST
 * Staff cannot submit for other employees
 */
const createLeaveRequest = async (req, res) => {
  try {
    let {
      employeeId,
      leaveType,
      startDate,
      endDate,
      reason,
    } = req.body;

    if (!leaveType || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Leave type, start date, and end date are required",
      });
    }

    if (!LEAVE_TYPES.includes(leaveType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave type",
      });
    }

    let employee;

    if (isAdmin(req)) {
      // Admin can submit for anyone
      if (!employeeId) {
        return res.status(400).json({
          success: false,
          message: "Employee is required",
        });
      }

      employee = await HREmployee.findOne({ employeeId });
    } else {
      // STAFF → auto attach their employee
      employee = await HREmployee.findOne({
        linkedUserId: req.user?.userId,
      });
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found or not linked",
      });
    }

    const totalDays = calculateTotalDays(startDate, endDate);

    if (totalDays <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range",
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
      submittedBy: req.user?.email || req.user?.fullName || "",
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

/**
 * ADMIN ONLY
 */
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

    const employee = await HREmployee.findOne({
      employeeId: leaveRequest.employeeId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if (leaveRequest.leaveType === "Vacation") {
      if (employee.leaveBalanceVacation < leaveRequest.totalDays) {
        return res.status(400).json({
          success: false,
          message: "Not enough vacation leave balance",
        });
      }

      employee.leaveBalanceVacation -= leaveRequest.totalDays;
    }

    if (leaveRequest.leaveType === "Sick") {
      if (employee.leaveBalanceSick < leaveRequest.totalDays) {
        return res.status(400).json({
          success: false,
          message: "Not enough sick leave balance",
        });
      }

      employee.leaveBalanceSick -= leaveRequest.totalDays;
    }

    await employee.save();

    leaveRequest.status = "Approved";
    leaveRequest.adminComment = normalizeString(adminComment);
    leaveRequest.reviewedAt = new Date();
    leaveRequest.reviewedBy = req.user?.email || "";

    await leaveRequest.save();

    res.json({
      success: true,
      message: "Leave request approved successfully",
      data: leaveRequest,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Approval failed",
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
        message: "Only pending requests can be rejected",
      });
    }

    leaveRequest.status = "Rejected";
    leaveRequest.adminComment = normalizeString(adminComment);
    leaveRequest.reviewedAt = new Date();
    leaveRequest.reviewedBy = req.user?.email || "";

    await leaveRequest.save();

    res.json({
      success: true,
      message: "Leave request rejected successfully",
      data: leaveRequest,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Rejection failed",
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