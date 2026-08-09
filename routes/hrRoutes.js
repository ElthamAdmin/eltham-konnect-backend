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
  refreshAttendancePeriodDraft,
  requestAttendanceAdjustment,
  reviewAttendanceAdjustment,
  reopenAttendancePeriod,
  lockAttendancePeriod,
  submitAttendancePeriod,
  approveAttendancePeriodByManager,
  markAttendancePeriodPayrollReady,
} = require(
  "../controllers/attendancePeriodController"
);

const {
  getMinimumWageRules,
  createMinimumWageRule,
  updateDraftMinimumWageRule,
  activateMinimumWageRule,
} = require(
  "../controllers/minimumWageRuleController"
);

const {
  previewLegacyPerformanceReviewMigration,
} = require(
  "../controllers/performanceReviewMigrationController"
);

const {
  getPerformanceReviews,
  getMyPerformanceReviews:
    getMyControlledPerformanceReviews,
  getPerformanceReviewByNumber,
  createPerformanceReviewDraft,
} = require(
  "../controllers/performanceReviewController"
);

const {
  updatePerformanceReviewDraft,
  startPerformanceGoalSetting,
  submitPerformanceGoals,
} = require(
  "../controllers/performanceReviewWorkflowController"
);

const {
  submitPerformanceSelfAssessment,
} = require(
  "../controllers/performanceReviewAssessmentController"
);

const {
  returnSelfAssessmentToEmployee,
  submitPerformanceManagerAssessment,
} = require(
  "../controllers/performanceReviewManagerAssessmentController"
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
 /*
 * H8 controlled performance reviews.
 *
 * Static and collection routes must remain
 * above /performance/:reviewNumber and the
 * generic /:employeeId route.
 */

router.get(
  "/performance/legacy-migration-preview",
  protect,
  requirePermission("hr"),
  previewLegacyPerformanceReviewMigration
);

router.get(
  "/performance/me",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
  ]),
  getMyControlledPerformanceReviews
);

router.get(
  "/performance",
  protect,
  requirePermission("hr"),
  getPerformanceReviews
);

router.post(
  "/performance",
  protect,
  requirePermission("hr"),
  createPerformanceReviewDraft
);

router.patch(
  "/performance/:reviewNumber/draft",
  protect,
  requirePermission("hr"),
  updatePerformanceReviewDraft
);

router.post(
  "/performance/:reviewNumber/goal-setting",
  protect,
  requirePermission("hr"),
  startPerformanceGoalSetting
);

router.post(
  "/performance/:reviewNumber/goals/submit",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
  ]),
  submitPerformanceGoals
);

router.post(
  "/performance/:reviewNumber/self-assessment",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
  ]),
  submitPerformanceSelfAssessment
);

router.post(
  "/performance/:reviewNumber/self-assessment/return",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
  ]),
  returnSelfAssessmentToEmployee
);

router.post(
  "/performance/:reviewNumber/manager-assessment",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
  ]),
  submitPerformanceManagerAssessment
);

router.get(
  "/performance/:reviewNumber",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
  ]),
  getPerformanceReviewByNumber
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

router.post(
  "/attendance-periods/:periodNumber/refresh",
  protect,
  requirePermission("hr"),
  refreshAttendancePeriodDraft
);

router.post(
  "/attendance-periods/:periodNumber/adjustments",
  protect,
  requirePermission("hr"),
  requestAttendanceAdjustment
);

router.post(
  "/attendance-periods/:periodNumber/submit",
  protect,
  requirePermission("hr"),
  submitAttendancePeriod
);

router.post(
  "/attendance-periods/:periodNumber/manager-approve",
  protect,
  requirePermission("hr"),
  approveAttendancePeriodByManager
);

router.post(
  "/attendance-periods/:periodNumber/payroll-ready",
  protect,
  requireAnyPermission([
    "hr",
    "payrollManage",
  ]),
  markAttendancePeriodPayrollReady
);

router.post(
  "/attendance-periods/:periodNumber/adjustments/:adjustmentNumber/review",
  protect,
  requirePermission("hr"),
  reviewAttendanceAdjustment
);

router.post(
  "/attendance-periods/:periodNumber/reopen",
  protect,
  requirePermission("hr"),
  reopenAttendancePeriod
);

router.post(
  "/attendance-periods/:periodNumber/lock",
  protect,
  requireAnyPermission([
    "hr",
    "payrollManage",
  ]),
  lockAttendancePeriod
);

/*
 * H4 effective-dated minimum-wage rules.
 * These routes must remain before /:employeeId.
 */
router.get(
  "/minimum-wage/rules",
  protect,
  requireAnyPermission([
    "hr",
    "payroll",
    "payrollManage",
    "payrollApprove",
  ]),
  getMinimumWageRules
);

router.post(
  "/minimum-wage/rules",
  protect,
  requireAnyPermission([
    "hr",
    "payrollManage",
  ]),
  createMinimumWageRule
);

router.patch(
  "/minimum-wage/rules/:ruleCode",
  protect,
  requireAnyPermission([
    "hr",
    "payrollManage",
  ]),
  updateDraftMinimumWageRule
);

router.post(
  "/minimum-wage/rules/:ruleCode/activate",
  protect,
  requireAnyPermission([
    "hr",
    "payrollApprove",
  ]),
  activateMinimumWageRule
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