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
} = require("../controllers/posController");

router.get("/drawer/open", protect, requirePermission("pos"), getOpenDrawer);
router.post("/drawer/open", protect, requirePermission("pos"), openDrawer);
router.post("/drawer/sale", protect, requirePermission("pos"), recordDrawerSale);
router.put("/drawer/close", protect, requirePermission("pos"), closeDrawer);
router.get("/drawer/history", protect, requirePermission("pos"), getDrawerHistory);

router.get("/invoice/:invoiceNumber", protect, requirePermission("pos"), findInvoiceForPOS);
router.post("/cashout", protect, requirePermission("pos"), cashOutInvoice);
router.get("/transactions", protect, requirePermission("pos"), getPOSTransactions);

module.exports = router;