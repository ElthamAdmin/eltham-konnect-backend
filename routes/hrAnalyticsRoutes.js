const express = require("express");
const router = express.Router();

const { getHRAnalyticsDashboard } = require("../controllers/hrAnalyticsController");
const {
  getAttendanceAndLatenessReport,
} = require(
  "../controllers/hrAttendanceReportingController"
);

const {
  getLeaveUtilizationReport,
} = require(
  "../controllers/hrLeaveUtilizationReportingController"
);

const {
  getTurnoverAndLifecycleReport,
} = require(
  "../controllers/hrTurnoverReportingController"
);

const {
  getPayrollEligibilityComplianceReport,
} = require(
  "../controllers/hrPayrollComplianceReportingController"
);

const {
  getHRReportingAudit,
} = require(
  "../controllers/hrReportingAuditController"
);

const {
  auditHRReportAccess,
} = require(
  "../middleware/hrReportingAuditMiddleware"
);

const { protect, requirePermission } = require("../middleware/authMiddleware");

/*
 * H11 reporting security and audit controls.
 *
 * Existing route-level permission checks may remain.
 * These router-level controls guarantee that every H11
 * report request is authenticated, HR-restricted and audited.
 */

router.use(
  protect,
  requirePermission("hr"),
  auditHRReportAccess
);

router.get(
  "/dashboard",
  protect,
  requirePermission("hr"),
  getHRAnalyticsDashboard
);

router.get(
  "/attendance",
  protect,
  requirePermission("hr"),
  getAttendanceAndLatenessReport
);

router.get(
  "/leave-utilization",
  protect,
  requirePermission("hr"),
  getLeaveUtilizationReport
);

router.get(
  "/turnover",
  protect,
  requirePermission("hr"),
  getTurnoverAndLifecycleReport
);

router.get(
  "/payroll-compliance",
  protect,
  requirePermission("hr"),
  getPayrollEligibilityComplianceReport
);

/*
 * H11 Stage 8 reporting audit and CSV export.
 */

router.get(
  "/reporting-audit",
  getHRReportingAudit
);

module.exports = router;

