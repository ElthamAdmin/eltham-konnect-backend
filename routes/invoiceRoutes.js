const express = require("express");
const router = express.Router();

const {
  createInvoice,
  generateMultipleInvoice,
  getInvoices,
  updateInvoicePaymentLink,
  markInvoicePaid,
} = require("../controllers/invoiceController");

router.get("/", getInvoices);
router.post("/", createInvoice);
router.post("/generate-multiple", generateMultipleInvoice);
router.put("/:invoiceNumber/payment-link", updateInvoicePaymentLink);
router.put("/pay/:invoiceNumber", markInvoicePaid);

module.exports = router;