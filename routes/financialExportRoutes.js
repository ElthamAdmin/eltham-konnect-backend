const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  exportTrialBalance,
  exportGeneralLedger,
  exportProfitAndLoss,
  exportBalanceSheet,
} = require("../controllers/financialExportController");

router.get(
  "/trial-balance",
  protect,
  exportTrialBalance
);

router.get(
  "/general-ledger",
  protect,
  exportGeneralLedger
);

router.get(
  "/profit-loss",
  protect,
  exportProfitAndLoss
);

router.get(
  "/balance-sheet",
  protect,
  exportBalanceSheet
);

module.exports = router;