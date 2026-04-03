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
  requireAnyPermission,
} = require("../middleware/authMiddleware");

// 🔹 ADMIN ONLY
router.get("/summary", protect, requirePermission("hr"), getEmployeeSummary);
router.post("/", protect, requirePermission("hr"), createEmployee);
router.put("/:employeeId", protect, requirePermission("hr"), updateEmployee);
router.put("/:employeeId/status", protect, requirePermission("hr"), updateEmployeeStatus);

// 🔹 ADMIN + SELF SERVICE ACCESS
router.get(
  "/",
  protect,
  requireAnyPermission(["hr", "hrSelfService"]),
  getEmployees
);

router.get(
  "/:employeeId",
  protect,
  requireAnyPermission(["hr", "hrSelfService"]),
  getEmployeeByEmployeeId
);

module.exports = router;