const express = require("express");
const router = express.Router();

const {
  getEmployeeRelationsCases,
  getMyEmployeeRelationsCases,
  getEmployeeRelationsCaseByNumber,
  createDisciplineCaseDraft,
  submitGrievanceCase,
} = require(
  "../controllers/employeeRelationsController"
);

const {
  previewLegacyDisciplineMigration,
} = require(
  "../controllers/employeeRelationsMigrationController"
);

const {
  submitDisciplineCase,
  startCaseInvestigation,
  scheduleCaseHearing,
  completeCaseHearing,
} = require(
  "../controllers/employeeRelationsWorkflowController"
);

const {
  issueCaseDecision,
  acknowledgeCaseDecision,
} = require(
  "../controllers/employeeRelationsDecisionController"
);

const {
  protect,
  requirePermission,
  requireAnyPermission,
} = require(
  "../middleware/authMiddleware"
);

const canUseEmployeeRelationsSelfService =
  requireAnyPermission([
    "hr",
    "hrSelfService",
  ]);

/*
 * Employee-owned routes must remain above
 * the generic /:caseNumber route.
 */

router.get(
  "/legacy-migration-preview",
  protect,
  requirePermission("hr"),
  previewLegacyDisciplineMigration
);

router.get(
  "/me",
  protect,
  canUseEmployeeRelationsSelfService,
  getMyEmployeeRelationsCases
);

router.post(
  "/grievances",
  protect,
  canUseEmployeeRelationsSelfService,
  submitGrievanceCase
);

/*
 * HR case-management routes.
 */

router.get(
  "/",
  protect,
  requirePermission("hr"),
  getEmployeeRelationsCases
);

router.post(
  "/discipline",
  protect,
  requirePermission("hr"),
  createDisciplineCaseDraft
);

/*
 * H7 controlled workflow transitions.
 *
 * All action routes must remain above
 * the generic GET /:caseNumber route.
 */

router.post(
  "/:caseNumber/submit",
  protect,
  requirePermission("hr"),
  submitDisciplineCase
);

router.post(
  "/:caseNumber/investigation",
  protect,
  requirePermission("hr"),
  startCaseInvestigation
);

router.post(
  "/:caseNumber/hearings",
  protect,
  requirePermission("hr"),
  scheduleCaseHearing
);

router.post(
  "/:caseNumber/hearings/:hearingNumber/complete",
  protect,
  requirePermission("hr"),
  completeCaseHearing
);

router.post(
  "/:caseNumber/decision",
  protect,
  requirePermission("hr"),
  issueCaseDecision
);

router.post(
  "/:caseNumber/acknowledge",
  protect,
  canUseEmployeeRelationsSelfService,
  acknowledgeCaseDecision
);

/*
 * Generic case route must remain last.
 * The controller performs an additional
 * participant-ownership access check.
 */

router.get(
  "/:caseNumber",
  protect,
  canUseEmployeeRelationsSelfService,
  getEmployeeRelationsCaseByNumber
);

module.exports = router;