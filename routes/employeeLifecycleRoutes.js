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
  requestEmployeeLifecycleAccessAction,
  completeEmployeeLifecycleAccessAction,
} = require(
  "../controllers/employeeLifecycleAccessController"
);

const {
  recordPropertyOutcome,
} = require(
  "../controllers/employeeLifecyclePropertyController"
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
 * H9 controlled checklist workflow.
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
 * H9 Stage 3A controlled system-access coordination.
 *
 * These routes record requests and evidence.
 * They do not directly change SystemUser.
 */

router.post(
  "/:lifecycleCaseNumber/access/:accessItemNumber/request",
  protect,
  requirePermission("hr"),
  requestEmployeeLifecycleAccessAction
);

router.post(
  "/:lifecycleCaseNumber/access/:accessItemNumber/outcome",
  protect,
  requirePermission("hr"),
  completeEmployeeLifecycleAccessAction
);

/*
 * H9 Stage 3B controlled property custody.
 *
 * This route records issuance, return, transfer,
 * loss, damage and custody evidence. It does not
 * directly change inventory or fixed assets.
 */

router.post(
  "/:lifecycleCaseNumber/property/:propertyNumber/outcome",
  protect,
  requirePermission("hr"),
  recordPropertyOutcome
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