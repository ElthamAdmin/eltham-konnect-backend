const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getARAging,
  getCustomerStatement,
  getARReconciliation,
  getARDiagnosticAudit,
  getCollectionsDashboard,
  getCustomerCollectionsProfile,
  getCollectionsWorkQueue,
  addCollectionNote,
  updateCollectionWorkflow,
} = require("../controllers/accountsReceivableController");

router.get("/aging", protect, getARAging);
router.get("/reconcile", protect, getARReconciliation);
router.get("/diagnostic-audit", protect, getARDiagnosticAudit);
router.get("/customers/:customerEkonId/statement", protect, getCustomerStatement);
router.get("/collections/customers/:customerEkonId", protect, getCustomerCollectionsProfile);
router.post("/collections/invoices/:invoiceNumber/notes", protect, addCollectionNote);
router.put("/collections/invoices/:invoiceNumber/workflow", protect, updateCollectionWorkflow);
router.get("/collections/work-queue", protect, getCollectionsWorkQueue);
router.get("/collections-dashboard", protect, getCollectionsDashboard);
module.exports = router;