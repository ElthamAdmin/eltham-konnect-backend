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
  getOrganizationChart,
  getEmployeeSummary,
} = require("../controllers/hrController");

const {
  getCompensationRecords,
  createCompensationDraft,
  updateCompensationDraft,
} = require(
  "../controllers/compensationController"
);

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
router.get("/organization-chart", protect, requirePermission("hr"), getOrganizationChart);

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

/*
 * H2 compensation history.
 * These routes must remain before
 * the generic /:employeeId route.
 */
router.get(
  "/compensation",
  protect,
  requirePermission("hr"),
  getCompensationRecords
);

router.post(
  "/compensation",
  protect,
  requirePermission("hr"),
  createCompensationDraft
);

router.patch(
  "/compensation/:compensationNumber",
  protect,
  requirePermission("hr"),
  updateCompensationDraft
);

// HR-management access only.
// Employees must use /me for their own profile.
router.get(
  "/",
  protect,
  requirePermission("hr"),
  getEmployees
);

router.get(
  "/:employeeId",
  protect,
  requirePermission("hr"),
  getEmployeeByEmployeeId
);

module.exports = router;