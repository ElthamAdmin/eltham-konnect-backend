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
  updateProbationCoordination,
  recordProbationOutcome,
} = require(
  "../controllers/employeeLifecycleProbationController"
);

const {
  updateFinalPayrollCoordination,
  linkFinalPayrollRecord,
} = require(
  "../controllers/employeeLifecycleFinalPayrollController"
);

const {
  previewEmployeeLifecycleCompletion,
  completeEmployeeLifecycleCase,
} = require(
  "../controllers/employeeLifecycleCompletionController"
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
 * H9 Stage 3C controlled probation coordination.
 *
 * These routes coordinate onboarding probation,
 * review dates, H8 review references, extensions
 * and final outcomes. They do not directly modify
 * the linked H8 performance-review record.
 */

router.patch(
  "/:lifecycleCaseNumber/probation",
  protect,
  requirePermission("hr"),
  updateProbationCoordination
);

router.post(
  "/:lifecycleCaseNumber/probation/outcome",
  protect,
  requirePermission("hr"),
  recordProbationOutcome
);

/*
 * H9 Stage 3D controlled final-payroll coordination.
 *
 * These routes coordinate and link an existing
 * payroll record. They do not calculate, approve,
 * pay, cancel or reverse payroll.
 */

router.patch(
  "/:lifecycleCaseNumber/final-payroll",
  protect,
  requirePermission("hr"),
  updateFinalPayrollCoordination
);

router.post(
  "/:lifecycleCaseNumber/final-payroll/link",
  protect,
  requirePermission("hr"),
  linkFinalPayrollRecord
);

/*
 * H9 Stage 4 controlled lifecycle completion.
 *
 * The preview is read-only. Completion is allowed
 * only after every required approval, checklist,
 * access, property, probation and final-payroll
 * obligation has passed validation.
 */

router.get(
  "/:lifecycleCaseNumber/completion-preview",
  protect,
  requirePermission("hr"),
  previewEmployeeLifecycleCompletion
);

router.post(
  "/:lifecycleCaseNumber/complete",
  protect,
  requirePermission("hr"),
  completeEmployeeLifecycleCase
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