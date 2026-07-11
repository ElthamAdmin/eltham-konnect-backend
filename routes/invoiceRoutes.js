const express = require("express");
const router = express.Router();

const {
  createInvoice,
  generateMultipleInvoice,
  generateCustomerPurchaseInvoice,
  getInvoices,
  updateInvoicePaymentLink,
  markInvoicePaid,
  updateInvoiceChargesAdjustment,
  applyInvoicePointsAdjustment,
  reconcilePaidInvoicePackages,
} = require("../controllers/invoiceController");

const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getInvoices);
router.post("/", protect, createInvoice);
router.post(
  "/generate-multiple",
  protect,
  generateMultipleInvoice
);

router.post(
  "/generate-customer-purchases",
  protect,
  generateCustomerPurchaseInvoice
);

router.put(
  "/:invoiceNumber/payment-link",
  protect,
  updateInvoicePaymentLink
);
router.put("/:invoiceNumber/apply-points", protect, applyInvoicePointsAdjustment);
router.put("/:invoiceNumber/charges", protect, updateInvoiceChargesAdjustment);
router.put("/pay/:invoiceNumber", protect, markInvoicePaid);
router.put("/reconcile/paid-packages", protect, reconcilePaidInvoicePackages);

module.exports = router;