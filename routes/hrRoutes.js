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
  getMyCompensationRecords,
  createCompensationDraft,
  updateCompensationDraft,
  previewLegacyCompensationMigration,
  activateCompensationRecord,
  cancelCompensationDraft,
} = require(
  "../controllers/compensationController"
);

const {
  getAttendancePeriods,
  previewAttendancePeriod,
  createAttendancePeriodDraft,
} = require(
  "../controllers/attendancePeriodController"
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
  "/me/compensation",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
    "leaveSelfService",
    "documentSelfService",
    "payslipSelfService",
  ]),
  getMyCompensationRecords
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
  "/compensation/legacy-migration-preview",
  protect,
  requirePermission("hr"),
  previewLegacyCompensationMigration
);

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

router.post(
  "/compensation/:compensationNumber/activate",
  protect,
  requirePermission("hr"),
  activateCompensationRecord
);

router.post(
  "/compensation/:compensationNumber/cancel",
  protect,
  requirePermission("hr"),
  cancelCompensationDraft
);

/*
 * H3 controlled attendance periods.
 * These routes must remain before /:employeeId.
 */
router.get(
  "/attendance-periods",
  protect,
  requireAnyPermission([
    "hr",
    "payroll",
    "payrollManage",
  ]),
  getAttendancePeriods
);

router.post(
  "/attendance-periods/preview",
  protect,
  requireAnyPermission([
    "hr",
    "payroll",
    "payrollManage",
  ]),
  previewAttendancePeriod
);

router.post(
  "/attendance-periods",
  protect,
  requirePermission("hr"),
  createAttendancePeriodDraft
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