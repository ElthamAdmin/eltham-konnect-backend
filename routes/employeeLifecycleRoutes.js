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
  protect,
  requirePermission,
} = require(
  "../middleware/authMiddleware"
);

/*
 * H9 controlled onboarding and offboarding.
 *
 * Collection routes must remain above the
 * generic /:lifecycleCaseNumber route.
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
 * Generic lifecycle-case route must remain last.
 */

router.get(
  "/:lifecycleCaseNumber",
  protect,
  requirePermission("hr"),
  getEmployeeLifecycleCaseByNumber
);

module.exports = router;