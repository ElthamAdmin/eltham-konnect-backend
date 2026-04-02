const express = require("express");
const router = express.Router();

const {
  getLeaveRequests,
  getLeaveRequestById,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
} = require("../controllers/leaveController");

// Leave request list and creation
router.get("/", getLeaveRequests);
router.post("/", createLeaveRequest);

// Single leave request
router.get("/:leaveRequestId", getLeaveRequestById);

// Admin actions
router.put("/:leaveRequestId/approve", approveLeaveRequest);
router.put("/:leaveRequestId/reject", rejectLeaveRequest);

module.exports = router;