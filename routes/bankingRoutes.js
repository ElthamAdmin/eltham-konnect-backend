const express = require("express");

const router = express.Router();

const {
  protect,
} = require("../middleware/authMiddleware");

const {
  requireFinanceAdmin,
} = require("../middleware/financeAdminMiddleware");

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
  startReconciliationWizard,
  loadReconciliationWorkspace,
  acceptStatementMatch,
  rejectStatementMatch,
  searchLedgerTransactionsForMatch,
  splitMatchStatementLine,
  createReconciliationAdjustment,
} = require("../controllers/bankingController");

/*
|--------------------------------------------------------------------------
| Banking Dashboard and Register
|--------------------------------------------------------------------------
*/

router.get("/", protect, getBankingDashboard);

router.get(
  "/register/:accountNumber",
  protect,
  getBankRegister
);

/*
|--------------------------------------------------------------------------
| Owner/Admin-Only Reconciliation
|--------------------------------------------------------------------------
*/

router.use(
  "/reconciliation",
  protect,
  requireFinanceAdmin
);

router.get(
  "/reconciliation",
  getReconciliations
);

router.get(
  "/reconciliation/:reconciliationNumber",
  getReconciliationByNumber
);

router.post(
  "/reconciliation",
  createBankReconciliation
);

router.put(
  "/reconciliation/:reconciliationNumber/finalize",
  finalizeBankReconciliation
);

router.put(
  "/reconciliation/:reconciliationNumber/reopen",
  reopenBankReconciliation
);

router.post(
  "/reconciliation/import",
  importBankStatement
);

router.post(
  "/reconciliation/wizard/start",
  startReconciliationWizard
);

router.get(
  "/reconciliation/workspace/:importNumber",
  loadReconciliationWorkspace
);

router.post(
  "/reconciliation/auto-match",
  autoMatchBankStatement
);

router.get(
  "/reconciliation/import/history",
  getImportedStatements
);

router.post(
  "/reconciliation/import/accept-match",
  acceptStatementMatch
);

router.post(
  "/reconciliation/import/reject-match",
  rejectStatementMatch
);

router.get(
  "/reconciliation/import/search-ledger",
  searchLedgerTransactionsForMatch
);

router.post(
  "/reconciliation/import/split-match",
  splitMatchStatementLine
);

router.post(
  "/reconciliation/import/adjustment",
  createReconciliationAdjustment
);

module.exports = router;