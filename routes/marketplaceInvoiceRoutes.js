const express = require("express");

const {
  generateMarketplaceInvoice,
  getAllMarketplaceInvoices,
  getMyMarketplaceInvoices,
  updateMarketplaceInvoicePaymentLink,
  markMarketplaceInvoicePaid,
  updateMarketplaceInvoiceCharges,
} = require("../controllers/marketplaceInvoiceController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/generate/:orderNumber", protect, generateMarketplaceInvoice);
router.get("/", protect, getAllMarketplaceInvoices);
router.get("/my-invoices", protect, getMyMarketplaceInvoices);
router.put("/:invoiceNumber/payment-link", protect, updateMarketplaceInvoicePaymentLink);
router.put("/:invoiceNumber/charges", protect, updateMarketplaceInvoiceCharges);
router.put("/:invoiceNumber/mark-paid", protect, markMarketplaceInvoicePaid);

module.exports = router;