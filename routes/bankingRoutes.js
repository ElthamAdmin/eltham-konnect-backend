const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getBankingDashboard,
  getBankRegister,
  getReconciliations,
  getReconciliationByNumber,
  createBankReconciliation,
  finalizeBankReconciliation,
  reopenBankReconciliation,
  importBankStatement,
  autoMatchBankStatement,
  getImportedStatements,
} = require("../controllers/bankingController");

/*
|--------------------------------------------------------------------------
| Banking Dashboard
|--------------------------------------------------------------------------
*/

router.get("/", protect, getBankingDashboard);

/*
|--------------------------------------------------------------------------
| Bank Register
|--------------------------------------------------------------------------
*/

router.get("/register/:accountNumber", protect, getBankRegister);

/*
|--------------------------------------------------------------------------
| Bank Reconciliation
|--------------------------------------------------------------------------
*/

router.get("/reconciliation", protect, getReconciliations);

router.get(
  "/reconciliation/:reconciliationNumber",
  protect,
  getReconciliationByNumber
);

router.post(
  "/reconciliation",
  protect,
  createBankReconciliation
);

router.put(
  "/reconciliation/:reconciliationNumber/finalize",
  protect,
  finalizeBankReconciliation
);

router.put(
  "/reconciliation/:reconciliationNumber/reopen",
  protect,
  reopenBankReconciliation
);

/*
|--------------------------------------------------------------------------
| Bank Statement Import
|--------------------------------------------------------------------------
*/

router.post(
  "/reconciliation/import",
  protect,
  importBankStatement
);

router.post(
  "/reconciliation/auto-match",
  protect,
  autoMatchBankStatement
);

router.get(
  "/reconciliation/import/history",
  protect,
  getImportedStatements
);

module.exports = router;