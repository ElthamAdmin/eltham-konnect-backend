const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getTrialBalance,
} = require("../controllers/trialBalanceController");

router.get("/", protect, getTrialBalance);

module.exports = router;