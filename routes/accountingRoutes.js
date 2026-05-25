const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getProfitAndLoss,
  getBalanceSheet,
  closeYearToRetainedEarnings,
} = require("../controllers/accountingController");

const {
  closeAccountingPeriod,
} = require("../controllers/accountingPeriodController");

router.get("/profit-loss", protect, getProfitAndLoss);
router.get("/balance-sheet", protect, getBalanceSheet);
router.post(
  "/close-period",
  protect,
  closeAccountingPeriod
);

router.post(
  "/close-year",
  protect,
  closeYearToRetainedEarnings
);

module.exports = router;