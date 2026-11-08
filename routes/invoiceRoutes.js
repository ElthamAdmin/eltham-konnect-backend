const express = require("express");
const router = express.Router();

const {
  generateMultipleInvoice,
  generateCustomerPurchaseInvoice,
  getInvoices,
  getMyInvoices,
  updateInvoicePaymentLink,
  markInvoicePaid,
  updateInvoiceChargesAdjustment,
  applyInvoicePointsAdjustment,
} = require("../controllers/invoiceController");

const {
  protect,
  requirePermission,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const {
  generateStorageInvoice,
  blockStorageInvoiceAdjustment,
} = require("../controllers/storageBillingController");

const {
  protectCustomer,
} = require("../middleware/customerAuthMiddleware");

router.get("/my", protectCustomer, getMyInvoices);

router.get(
  "/",
  protect,
  requireAnyPermission(["invoices", "finance", "pos"]),
  getInvoices
);

router.use(protect, requirePermission("invoices"));

router.post("/storage/:packageId", generateStorageInvoice);
router.post("/generate-multiple", generateMultipleInvoice);
router.post("/generate-customer-purchases", generateCustomerPurchaseInvoice);

router.put("/:invoiceNumber/payment-link", updateInvoicePaymentLink);

router.put(
  "/:invoiceNumber/apply-points",
  blockStorageInvoiceAdjustment,
  applyInvoicePointsAdjustment
);

router.put(
  "/:invoiceNumber/charges",
  blockStorageInvoiceAdjustment,
  updateInvoiceChargesAdjustment
);

router.put("/pay/:invoiceNumber", markInvoicePaid);

router.put("/reconcile/paid-packages", (req, res) => {
  return res.status(409).json({
    success: false,
    message: "Historical package reconciliation is disabled.",
  });
});

module.exports = router;