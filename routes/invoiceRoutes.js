const express = require("express");
const router = express.Router();

const {
  createInvoice,
  generateMultipleInvoice,
  getInvoices,
  updateInvoicePaymentLink,
  markInvoicePaid,
  updateInvoiceChargesAdjustment,
  applyInvoicePointsAdjustment,
  reconcilePaidInvoicePackages,
} = require("../controllers/invoiceController");

router.get("/", getInvoices);
router.post("/", createInvoice);
router.post("/generate-multiple", generateMultipleInvoice);
router.put("/:invoiceNumber/payment-link", updateInvoicePaymentLink);
router.put("/:invoiceNumber/apply-points", applyInvoicePointsAdjustment);
router.put("/:invoiceNumber/charges", updateInvoiceChargesAdjustment);
router.put("/pay/:invoiceNumber", markInvoicePaid);
router.put("/reconcile/paid-packages", reconcilePaidInvoicePackages);

module.exports = router;