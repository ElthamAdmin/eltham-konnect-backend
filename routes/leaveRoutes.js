const express = require("express");
const router = express.Router();

const {
  getLeaveRequests,
  getLeaveRequestById,
  createLeaveRequest,
  approveLeaveRequest,
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
 * Leave requests.
 *
 * HR users can retrieve all records.
 * Self-service users are restricted
 * to their own records by the controller.
 */

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

router.put(
  "/:leaveRequestId/approve",
  protect,
  requirePermission("hr"),
  approveLeaveRequest
);

router.put(
  "/:leaveRequestId/reject",
  protect,
  requirePermission("hr"),
  rejectLeaveRequest
);

module.exports = router;