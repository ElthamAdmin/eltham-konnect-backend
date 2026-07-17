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

module.exports = router;