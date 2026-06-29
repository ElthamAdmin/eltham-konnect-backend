const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getAccountingPeriods,
  getCurrentAccountingPeriod,
  createAccountingPeriod,
  validateAccountingPeriod,
  closeAccountingManagementPeriod,
  lockAccountingPeriod,
  reopenAccountingPeriod,
} = require("../controllers/accountingPeriodManagementController");

router.get("/", protect, getAccountingPeriods);
router.get("/current", protect, getCurrentAccountingPeriod);

router.post("/", protect, createAccountingPeriod);

router.get("/:periodNumber/validate", protect, validateAccountingPeriod);

router.put("/:periodNumber/close", protect, closeAccountingManagementPeriod);
router.put("/:periodNumber/lock", protect, lockAccountingPeriod);
router.put("/:periodNumber/reopen", protect, reopenAccountingPeriod);

module.exports = router;