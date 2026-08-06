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