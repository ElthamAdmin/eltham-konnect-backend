const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getTaxCenterDashboard,
  getTaxRecords,
  createTaxRecord,
  generatePayrollTaxSummary,
  generatePayrollLiabilities,
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

module.exports = router;