const express = require("express");
const router = express.Router();

const {
  getLeaveRequests,
  getLeaveRequestById,
  previewLeaveRequest,
  createLeaveRequest,
  submitLeaveRequest,
  approveLeaveRequestByManager,
  approveLeaveRequestByHr,
  rejectLeaveRequest,
} = require(
  "../controllers/leaveController"
);

const {
  getLeavePolicies,
  createLeavePolicyDraft,
  updateLeavePolicyDraft,
  activateLeavePolicy,
  retireLeavePolicy,
} = require(
  "../controllers/leavePolicyController"
);

const {
  previewLegacyLeaveBalanceMigration,
  migrateLegacyLeaveBalances,
  getEmployeeLeaveBalanceLedger,
} = require(
  "../controllers/leaveBalanceController"
);

const {
  protect,
  requirePermission,
  requireAnyPermission,
} = require(
  "../middleware/authMiddleware"
);

const canAccessLeaveSelfService =
  requireAnyPermission([
    "hr",
    "leaveSelfService",
    "hrSelfService",
  ]);

/*
 * H5 effective-dated leave policies.
 *
 * These routes must remain above
 * the generic /:leaveRequestId route.
 */

router.get(
  "/policies",
  protect,
  requirePermission("hr"),
  getLeavePolicies
);

router.post(
  "/policies",
  protect,
  requirePermission("hr"),
  createLeavePolicyDraft
);

router.patch(
  "/policies/:policyCode",
  protect,
  requirePermission("hr"),
  updateLeavePolicyDraft
);

router.post(
  "/policies/:policyCode/activate",
  protect,
  requirePermission("hr"),
  activateLeavePolicy
);

router.post(
  "/policies/:policyCode/retire",
  protect,
  requirePermission("hr"),
  retireLeavePolicy
);

/*
 * H5 controlled leave requests.
 *
 * Preview and collection routes must remain
 * above the generic /:leaveRequestId routes.
 */

/*
 * H5 controlled leave-balance ledger.
 *
 * Static migration routes must remain above
 * the generic /balances/:employeeId route.
 */

router.get(
  "/balances/legacy-migration-preview",
  protect,
  requirePermission("hr"),
  previewLegacyLeaveBalanceMigration
);

router.post(
  "/balances/legacy-migration",
  protect,
  requirePermission("hr"),
  migrateLegacyLeaveBalances
);

router.get(
  "/balances/:employeeId",
  protect,
  requirePermission("hr"),
  getEmployeeLeaveBalanceLedger
);

router.post(
  "/preview",
  protect,
  canAccessLeaveSelfService,
  previewLeaveRequest
);

router.get(
  "/",
  protect,
  canAccessLeaveSelfService,
  getLeaveRequests
);

router.post(
  "/",
  protect,
  canAccessLeaveSelfService,
  createLeaveRequest
);

/*
 * Generic parameter routes must remain last.
 */

router.get(
  "/:leaveRequestId",
  protect,
  canAccessLeaveSelfService,
  getLeaveRequestById
);

router.post(
  "/:leaveRequestId/submit",
  protect,
  canAccessLeaveSelfService,
  submitLeaveRequest
);

router.post(
  "/:leaveRequestId/manager-approve",
  protect,
  requirePermission("hr"),
  approveLeaveRequestByManager
);

router.post(
  "/:leaveRequestId/hr-approve",
  protect,
  requirePermission("hr"),
  approveLeaveRequestByHr
);

router.post(
  "/:leaveRequestId/reject",
  protect,
  requirePermission("hr"),
  rejectLeaveRequest
);

module.exports = router;