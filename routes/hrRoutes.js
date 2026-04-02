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

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

// Full HR admin access only
router.get("/summary", protect, requirePermission("hr"), getEmployeeSummary);
router.get("/", protect, requirePermission("hr"), getEmployees);
router.get("/:employeeId", protect, requirePermission("hr"), getEmployeeByEmployeeId);
router.post("/", protect, requirePermission("hr"), createEmployee);
router.put("/:employeeId", protect, requirePermission("hr"), updateEmployee);
router.put("/:employeeId/status", protect, requirePermission("hr"), updateEmployeeStatus);

module.exports = router;