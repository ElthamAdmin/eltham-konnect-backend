const express = require("express");
const router = express.Router();

const {
  getEmployeeLifecycleCases,
  getEmployeeLifecycleCaseByNumber,
  createEmployeeLifecycleCaseDraft,
} = require(
  "../controllers/employeeLifecycleController"
);

const {
  submitEmployeeLifecycleCase,
  decideEmployeeLifecycleCaseByManager,
  decideEmployeeLifecycleCaseByHr,
} = require(
  "../controllers/employeeLifecycleWorkflowController"
);

const {
  startEmployeeLifecycleCase,
  updateEmployeeLifecycleChecklistItem,
} = require(
  "../controllers/employeeLifecycleChecklistController"
);

const {
  protect,
  requirePermission,
} = require(
  "../middleware/authMiddleware"
);

/*
 * H9 controlled onboarding and offboarding.
 *
 * Collection routes must remain above all
 * parameterized lifecycle-case routes.
 */

router.get(
  "/",
  protect,
  requirePermission("hr"),
  getEmployeeLifecycleCases
);

router.post(
  "/",
  protect,
  requirePermission("hr"),
  createEmployeeLifecycleCaseDraft
);

/*
 * H9 controlled approval workflow.
 */

router.post(
  "/:lifecycleCaseNumber/submit",
  protect,
  requirePermission("hr"),
  submitEmployeeLifecycleCase
);

router.post(
  "/:lifecycleCaseNumber/manager-decision",
  protect,
  requirePermission("hr"),
  decideEmployeeLifecycleCaseByManager
);

router.post(
  "/:lifecycleCaseNumber/hr-decision",
  protect,
  requirePermission("hr"),
  decideEmployeeLifecycleCaseByHr
);

/*
 * H9 Stage 2B controlled checklist workflow.
 *
 * The checklist-item route must remain above
 * the generic GET /:lifecycleCaseNumber route.
 */

router.post(
  "/:lifecycleCaseNumber/start",
  protect,
  requirePermission("hr"),
  startEmployeeLifecycleCase
);

router.patch(
  "/:lifecycleCaseNumber/checklist/:itemNumber",
  protect,
  requirePermission("hr"),
  updateEmployeeLifecycleChecklistItem
);

/*
 * Generic lifecycle-case route must remain last.
 */

router.get(
  "/:lifecycleCaseNumber",
  protect,
  requirePermission("hr"),
  getEmployeeLifecycleCaseByNumber
);

module.exports = router;