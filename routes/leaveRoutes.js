const express = require("express");
const router = express.Router();

const {
  getLeaveRequests,
  getLeaveRequestById,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
} = require("../controllers/leaveController");

const {
  protect,
  requirePermission,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

// Admin HR can view all leave requests
router.get("/", protect, requirePermission("hr"), getLeaveRequests);

// Staff self-service or HR admin can create leave requests
router.post(
  "/",
  protect,
  requireAnyPermission(["hr", "leaveSelfService", "hrSelfService"]),
  createLeaveRequest
);

// Admin HR can view a single leave request
router.get("/:leaveRequestId", protect, requirePermission("hr"), getLeaveRequestById);

// Admin HR actions
router.put("/:leaveRequestId/approve", protect, requirePermission("hr"), approveLeaveRequest);
router.put("/:leaveRequestId/reject", protect, requirePermission("hr"), rejectLeaveRequest);

module.exports = router;