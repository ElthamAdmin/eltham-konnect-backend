const express = require("express");
const multer = require("multer");

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
  returnManagerAssessment,
  approvePerformanceReviewByHr,
} = require(
  "../controllers/performanceReviewHrReviewController"
);

const {
  acknowledgePerformanceReview,
  activatePerformanceImprovementPlan,
  completePerformanceImprovementPlan,
} = require(
  "../controllers/performanceReviewCompletionController"
);

const {
  getPerformanceReviewMonitor,
  cancelPerformanceReview,
} = require(
  "../controllers/performanceReviewGovernanceController"
);

const {
  getMyProfileUpdateRequests,
  getProfileUpdateRequests,
  createMyProfileUpdateRequest,
  reviewProfileUpdateRequest,
  cancelMyProfileUpdateRequest,
} = require(
  "../controllers/employeeProfileUpdateRequestController"
);

const {
  uploadEmployeeProfilePhoto,
  removeEmployeeProfilePhoto,
} = require(
  "../controllers/employeePhotoController"
);

const {
  protect,
  requirePermission,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const employeePhotoAllowedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const employeePhotoUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },

  fileFilter: (
    req,
    file,
    callback
  ) => {
    if (
      employeePhotoAllowedTypes.includes(
        file.mimetype
      )
    ) {
      callback(null, true);
      return;
    }

    callback(
      new Error(
        "Only JPG, JPEG, PNG and WEBP employee photos are allowed."
      )
    );
  },
});

const employeePhotoUploadSingle =
  (req, res, next) => {
    employeePhotoUpload.single(
      "photo"
    )(
      req,
      res,
      (error) => {
        if (!error) {
          next();
          return;
        }

        return res.status(400).json({
          success: false,
          message:
            error.code ===
            "LIMIT_FILE_SIZE"
              ? "Employee photos cannot exceed 5 MB."
              : error.message ||
                "The employee photo could not be processed.",
        });
      }
    );
  };

// Admin only
router.get("/summary", protect, requirePermission("hr"), getEmployeeSummary);
router.post("/", protect, requirePermission("hr"), createEmployee);
router.put("/:employeeId", protect, requirePermission("hr"), updateEmployee);
router.put("/:employeeId/status", protect, requirePermission("hr"), updateEmployeeStatus);
router.post("/:employeeId/discipline", protect, requirePermission("hr"), addDisciplineRecord);
router.post("/:employeeId/performance", protect, requirePermission("hr"), addPerformanceReview);
router.get("/organization-chart", protect, requirePermission("hr"), getOrganizationChart);
router.post(
  "/:employeeId/profile-photo",
  protect,
  requirePermission("hr"),
  employeePhotoUploadSingle,
  uploadEmployeeProfilePhoto
);

router.delete(
  "/:employeeId/profile-photo",
  protect,
  requirePermission("hr"),
  removeEmployeeProfilePhoto
);

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
  "/performance/monitor",
  protect,
  requirePermission("hr"),
  getPerformanceReviewMonitor
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

router.post(
  "/performance/:reviewNumber/hr-review/return",
  protect,
  requirePermission("hr"),
  returnManagerAssessment
);

router.post(
  "/performance/:reviewNumber/hr-review/approve",
  protect,
  requirePermission("hr"),
  approvePerformanceReviewByHr
);

router.post(
  "/performance/:reviewNumber/acknowledge",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
  ]),
  acknowledgePerformanceReview
);

router.post(
  "/performance/:reviewNumber/improvement-plan/activate",
  protect,
  requirePermission("hr"),
  activatePerformanceImprovementPlan
);

router.post(
  "/performance/:reviewNumber/improvement-plan/complete",
  protect,
  requirePermission("hr"),
  completePerformanceImprovementPlan
);

router.post(
  "/performance/:reviewNumber/cancel",
  protect,
  requirePermission("hr"),
  cancelPerformanceReview
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
    "hrSelfService",
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
    requireAnyPermission([
    "hr",
    "hrSelfService",
  ]),
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

/*
 * H10 Stage 5 controlled profile-update requests.
 *
 * These static routes must remain above the
 * generic /:employeeId employee route.
 */

router.get(
  "/profile-update-requests/me",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
  ]),
  getMyProfileUpdateRequests
);

router.get(
  "/profile-update-requests",
  protect,
  requirePermission("hr"),
  getProfileUpdateRequests
);

router.post(
  "/profile-update-requests",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
  ]),
  createMyProfileUpdateRequest
);

router.post(
  "/profile-update-requests/:requestNumber/review",
  protect,
  requirePermission("hr"),
  reviewProfileUpdateRequest
);

router.post(
  "/profile-update-requests/:requestNumber/cancel",
  protect,
  requireAnyPermission([
    "hr",
    "hrSelfService",
  ]),
  cancelMyProfileUpdateRequest
);
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