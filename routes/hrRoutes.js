const express = require("express");
const router = express.Router();

const {
  getEmployees,
  getEmployeeByEmployeeId,
  getMyEmployeeProfile,
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
  addDisciplineRecord,
  getMyDisciplineRecords,
  addPerformanceReview,
  getMyPerformanceReviews,
  getEmployeeSummary,
} = require("../controllers/hrController");

const {
  protect,
  requirePermission,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

// Admin only
router.get("/summary", protect, requirePermission("hr"), getEmployeeSummary);
router.post("/", protect, requirePermission("hr"), createEmployee);
router.put("/:employeeId", protect, requirePermission("hr"), updateEmployee);
router.put("/:employeeId/status", protect, requirePermission("hr"), updateEmployeeStatus);
router.post("/:employeeId/discipline", protect, requirePermission("hr"), addDisciplineRecord);
router.post("/:employeeId/performance", protect, requirePermission("hr"), addPerformanceReview);

// Self-service profile route
router.get(
  "/me",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
    "leaveSelfService",
    "documentSelfService",
    "payslipSelfService",
  ]),
  getMyEmployeeProfile
);

router.get(
  "/me/discipline",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
    "payslipSelfService",
    "documentSelfService",
    "leaveSelfService",
  ]),
  getMyDisciplineRecords
);

router.get(
  "/me/performance",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
    "payslipSelfService",
    "documentSelfService",
    "leaveSelfService",
  ]),
  getMyPerformanceReviews
);

// Admin + self-service access
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