const express = require("express");
const router = express.Router();

const {
  getEmployees,
  getEmployeeByEmployeeId,
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
  getEmployeeSummary,
} = require("../controllers/hrController");

// ===============================
// EMPLOYEE CORE ROUTES
// ===============================
router.get("/summary", getEmployeeSummary);
router.get("/", getEmployees);
router.get("/:employeeId", getEmployeeByEmployeeId);
router.post("/", createEmployee);
router.put("/:employeeId", updateEmployee);
router.put("/:employeeId/status", updateEmployeeStatus);

// ===============================
// PLACEHOLDER ROUTES (NEXT STAGES)
// ===============================

// Leave Requests (Stage 2)
// router.get("/leave-requests", getLeaveRequests);
// router.post("/leave-requests", createLeaveRequest);
// router.put("/leave-requests/:id/approve", approveLeave);
// router.put("/leave-requests/:id/reject", rejectLeave);

// HR Documents (Stage 3)
// router.post("/:employeeId/documents", uploadEmployeeDocument);
// router.get("/:employeeId/documents", getEmployeeDocuments);

// Payslips (Stage 4)
// router.get("/:employeeId/payslips", getEmployeePayslips);

// Attendance (Stage 5)
// router.get("/:employeeId/attendance", getEmployeeAttendance);

module.exports = router;