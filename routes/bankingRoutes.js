const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getBankingDashboard,
  createBankReconciliation,
} = require("../controllers/bankingController");

router.get("/", protect, getBankingDashboard);

router.post(
  "/reconciliation",
  protect,
  createBankReconciliation
);

module.exports = router;