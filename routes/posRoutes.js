const express = require("express");
const router = express.Router();

const { protect, requirePermission } = require("../middleware/authMiddleware");

const {
  getOpenDrawer,
  openDrawer,
  recordDrawerSale,
  findInvoiceForPOS,
  cashOutInvoice,
  closeDrawer,
  getDrawerHistory,
  getPOSTransactions,
  getPOSAnalytics,
createShiftHandover,
createPOSActionLog,
getReceiptData,
} = require("../controllers/posController");

router.get("/drawer/open", protect, requirePermission("pos"), getOpenDrawer);
router.post("/drawer/open", protect, requirePermission("pos"), openDrawer);
router.post("/drawer/sale", protect, requirePermission("pos"), recordDrawerSale);
router.put("/drawer/close", protect, requirePermission("pos"), closeDrawer);
router.get("/drawer/history", protect, requirePermission("pos"), getDrawerHistory);

router.get("/invoice/:invoiceNumber", protect, requirePermission("pos"), findInvoiceForPOS);
router.post("/cashout", protect, requirePermission("pos"), cashOutInvoice);
router.get("/transactions", protect, requirePermission("pos"), getPOSTransactions);

router.get("/analytics", protect, requirePermission("pos_shift_reports"), getPOSAnalytics);
router.post("/shift-handover", protect, requirePermission("pos_shift_reports"), createShiftHandover);
router.post("/action-log", protect, requirePermission("pos_manager_override"), createPOSActionLog);
router.get("/receipt/:transactionNumber", protect, requirePermission("pos_receipts"), getReceiptData);

module.exports = router;