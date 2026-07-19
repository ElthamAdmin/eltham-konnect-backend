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

const {
  getBusinessEntities,
  getBusinessEntityByCode,
  resolveBusinessEntityForDate,
  createBusinessEntity,
  updatePlannedBusinessEntity,
  registerBusinessEntity,
  activateBusinessEntity,
  configureBusinessEntityIncomeTax,
} = require("../controllers/businessEntityController");

const {
  getIncomeTaxRules,
  createIncomeTaxRule,
  updateDraftIncomeTaxRule,
  activateIncomeTaxRule,
  previewIncomeTaxEstimate,
  getIncomeTaxEstimates,
createIncomeTaxEstimate,
transitionIncomeTaxEstimate,
} = require("../controllers/incomeTaxController");

const {
  getTaxDocuments,
  createTaxDocument,
  verifyTaxDocument,
} = require("../controllers/taxDocumentController");

const {
  getTaxGlReconciliation,
} = require("../controllers/taxReconciliationController");

const {
  receiveTaxDocumentUpload,
} = require("../middleware/taxDocumentUploadMiddleware");

const {
  uploadTaxDocument,
} = require("../controllers/taxDocumentUploadController");

const {
  backfillTaxDocumentCloudinaryMetadata,
  getTaxDocumentAccessLink,
} = require("../controllers/taxDocumentAccessController");

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

router.get(
  "/entities/resolve",
  protect,
  canManageTaxCenter,
  resolveBusinessEntityForDate
);

router.get(
  "/entities",
  protect,
  canManageTaxCenter,
  getBusinessEntities
);

router.get(
  "/entities/:entityCode",
  protect,
  canManageTaxCenter,
  getBusinessEntityByCode
);

router.post(
  "/entities",
  protect,
  canManageTaxCenter,
  createBusinessEntity
);

router.patch(
  "/entities/:entityCode",
  protect,
  canManageTaxCenter,
  updatePlannedBusinessEntity
);

router.post(
  "/entities/:entityCode/register",
  protect,
  canManageTaxCenter,
  registerBusinessEntity
);

router.post(
  "/entities/:entityCode/activate",
  protect,
  canManageTaxCenter,
  activateBusinessEntity
);

router.get(
  "/income-tax/rules",
  protect,
  canManageTaxCenter,
  getIncomeTaxRules
);

router.post(
  "/income-tax/rules",
  protect,
  canManageTaxCenter,
  createIncomeTaxRule
);

router.patch(
  "/income-tax/rules/:ruleCode",
  protect,
  canManageTaxCenter,
  updateDraftIncomeTaxRule
);

router.post(
  "/income-tax/rules/:ruleCode/activate",
  protect,
  canManageTaxCenter,
  activateIncomeTaxRule
);

router.post(
  "/income-tax/estimates/preview",
  protect,
  canManageTaxCenter,
  previewIncomeTaxEstimate
);

router.post(
  "/entities/:entityCode/income-tax-rule",
  protect,
  canManageTaxCenter,
  configureBusinessEntityIncomeTax
);

router.get(
  "/income-tax/estimates",
  protect,
  canManageTaxCenter,
  getIncomeTaxEstimates
);

router.post(
  "/income-tax/estimates",
  protect,
  canManageTaxCenter,
  createIncomeTaxEstimate
);

router.post(
  "/income-tax/estimates/:estimateNumber/workflow",
  protect,
  canManageTaxCenter,
  transitionIncomeTaxEstimate
);

router.get(
  "/documents",
  protect,
  canManageTaxCenter,
  getTaxDocuments
);

router.post(
  "/documents",
  protect,
  canManageTaxCenter,
  createTaxDocument
);

router.post(
  "/documents/:documentNumber/verification",
  protect,
  canManageTaxCenter,
  verifyTaxDocument
);

router.get(
  "/reconciliation/gl",
  protect,
  canManageTaxCenter,
  getTaxGlReconciliation
);

router.post(
  "/documents/upload",
  protect,
  canManageTaxCenter,
  receiveTaxDocumentUpload,
  uploadTaxDocument
);

router.post(
  "/documents/:documentNumber/cloudinary/backfill",
  protect,
  canManageTaxCenter,
  backfillTaxDocumentCloudinaryMetadata
);

router.get(
  "/documents/:documentNumber/access",
  protect,
  canManageTaxCenter,
  getTaxDocumentAccessLink
);

module.exports = router;