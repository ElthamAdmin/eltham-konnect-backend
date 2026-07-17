const express = require("express");

const {
  protect,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

const canManageTaxCenter = requireAnyPermission([
  "taxCenter",
  "finance",
]);

const {
  getTaxCenterDashboard,
  getTaxRecords,
  createTaxRecord,
  generatePayrollTaxSummary,
  generatePayrollLiabilities,
  transitionTaxRecordWorkflow,
  payTaxRecord,
  getTaxDeadlineRules,
  createTaxDeadlineRule,
  activateTaxDeadlineRule,
  applyTaxDeadlines,
} = require("../controllers/taxCenterController");

router.get("/dashboard", protect, getTaxCenterDashboard);

router.get("/records", protect, getTaxRecords);

router.post("/records", protect, createTaxRecord);

router.get("/payroll-summary", protect, generatePayrollTaxSummary);

router.post(
  "/payroll-liabilities/generate",
  protect,
  generatePayrollLiabilities
);

router.post(
  "/records/workflow",
  protect,
  canManageTaxCenter,
  transitionTaxRecordWorkflow
);

router.post(
  "/records/:taxNumber/pay",
  protect,
  canManageTaxCenter,
  payTaxRecord
);

router.get(
  "/deadline-rules",
  protect,
  canManageTaxCenter,
  getTaxDeadlineRules
);

router.post(
  "/deadline-rules",
  protect,
  canManageTaxCenter,
  createTaxDeadlineRule
);

router.post(
  "/deadline-rules/:ruleCode/activate",
  protect,
  canManageTaxCenter,
  activateTaxDeadlineRule
);

router.post(
  "/deadlines/apply",
  protect,
  canManageTaxCenter,
  applyTaxDeadlines
);

module.exports = router;