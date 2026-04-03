const express = require("express");
const router = express.Router();

const {
  getEmployees,
  getEmployeeByEmployeeId,
  getMyEmployeeProfile,
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
  getEmployeeSummary,
} = require("../controllers/hrController");

const {
  protect,
  requirePermission,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

// Full HR admin access
router.get("/summary", protect, requirePermission("hr"), getEmployeeSummary);
router.get("/", protect, requirePermission("hr"), getEmployees);

// Self-service profile endpoint
router.get(
  "/me",
  protect,
  requireAnyPermission(["hr", "hrSelfService", "leaveSelfService", "documentSelfService", "payslipSelfService"]),
  getMyEmployeeProfile
);

router.get("/:employeeId", protect, requirePermission("hr"), getEmployeeByEmployeeId);
router.post("/", protect, requirePermission("hr"), createEmployee);
router.put("/:employeeId", protect, requirePermission("hr"), updateEmployee);
router.put("/:employeeId/status", protect, requirePermission("hr"), updateEmployeeStatus);

module.exports = router;