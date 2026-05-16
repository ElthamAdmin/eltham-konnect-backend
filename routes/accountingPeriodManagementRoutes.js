const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getAccountingPeriods,
  createAccountingPeriod,
  closeAccountingManagementPeriod,
  lockAccountingPeriod,
} = require("../controllers/accountingPeriodManagementController");

router.get("/", protect, getAccountingPeriods);

router.post("/", protect, createAccountingPeriod);

router.put("/:periodNumber/close", protect, closeAccountingManagementPeriod);

router.put("/:periodNumber/lock", protect, lockAccountingPeriod);

module.exports = router;