const express = require("express");

const router = express.Router();

const {
  protect,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const {
  exportTrialBalance,
  exportGeneralLedger,
  exportProfitAndLoss,
  exportBalanceSheet,
} = require("../controllers/financialExportController");

router.use(
  protect,
  requireAnyPermission(["finance"])
);

router.get("/trial-balance", exportTrialBalance);
router.get("/general-ledger", exportGeneralLedger);
router.get("/profit-loss", exportProfitAndLoss);
router.get("/balance-sheet", exportBalanceSheet);

module.exports = router;