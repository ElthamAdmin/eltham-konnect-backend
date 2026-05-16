const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getProfitAndLoss,
  getBalanceSheet,
} = require("../controllers/accountingController");

router.get("/profit-loss", protect, getProfitAndLoss);
router.get("/balance-sheet", protect, getBalanceSheet);

module.exports = router;