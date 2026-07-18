const express = require("express");

const {
  protect,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const {
  reviewInvoiceTurnoverClassification,
  reviewExpenseInputGct,
} = require("../controllers/gctReviewController");


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

  transitionGctFilingWorkflow,
  getGctFilingPeriods,
  calculateGctFilingPeriod,
  getGctFilingRegister,

  getGctRegistrationProfiles,
  createGctRegistrationProfile,
  updateDraftGctRegistrationProfile,
  activateGctRegistrationProfile,
  getGctTurnoverMonitor,
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

router.post(
  "/gct/filing-periods/:filingNumber/workflow",
  protect,
  canManageTaxCenter,
  transitionGctFilingWorkflow
);

router.patch(
  "/gct/invoices/:invoiceNumber/classification",
  protect,
  canManageTaxCenter,
  reviewInvoiceTurnoverClassification
);

router.patch(
  "/gct/expenses/:expenseNumber/input-tax",
  protect,
  canManageTaxCenter,
  reviewExpenseInputGct
);



router.get(
  "/gct/filing-periods",
  protect,
  canManageTaxCenter,
  getGctFilingPeriods
);

router.post(
  "/gct/filing-periods/calculate",
  protect,
  canManageTaxCenter,
  calculateGctFilingPeriod
);

router.get(
  "/gct/filing-periods/:periodKey/register",
  protect,
  canManageTaxCenter,
  getGctFilingRegister
);


router.get(
  "/gct/profiles",
  protect,
  canManageTaxCenter,
  getGctRegistrationProfiles
);

router.post(
  "/gct/profiles",
  protect,
  canManageTaxCenter,
  createGctRegistrationProfile
);

router.patch(
  "/gct/profiles/:registrationCode",
  protect,
  canManageTaxCenter,
  updateDraftGctRegistrationProfile
);


router.post(
  "/gct/profiles/:registrationCode/activate",
  protect,
  canManageTaxCenter,
  activateGctRegistrationProfile
);

router.get(
  "/gct/turnover-monitor",
  protect,
  canManageTaxCenter,
  getGctTurnoverMonitor
);

module.exports = router;