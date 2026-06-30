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
  getReminderQueue,
  sendInvoiceReminder,
  getCollectionPerformanceKPIs,
  getWriteOffDashboard,
requestWriteOff,
approveWriteOff,
rejectWriteOff,
recordRecovery,
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
router.get("/collections/reminders", protect, getReminderQueue);
router.post("/collections/invoices/:invoiceNumber/reminder", protect, sendInvoiceReminder);
router.get("/collections/performance", protect, getCollectionPerformanceKPIs);
router.get("/write-offs", protect, getWriteOffDashboard);
router.post("/write-offs/invoices/:invoiceNumber/request", protect, requestWriteOff);
router.put("/write-offs/invoices/:invoiceNumber/approve", protect, approveWriteOff);
router.put("/write-offs/invoices/:invoiceNumber/reject", protect, rejectWriteOff);
router.post("/write-offs/invoices/:invoiceNumber/recovery", protect, recordRecovery);
module.exports = router;