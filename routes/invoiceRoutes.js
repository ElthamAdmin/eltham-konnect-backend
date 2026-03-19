const express = require("express");
const router = express.Router();

const {
  createInvoice,
  getInvoices,
  updateInvoicePaymentLink,
  markInvoicePaid,
} = require("../controllers/invoiceController");

router.get("/", getInvoices);
router.post("/", createInvoice);
router.put("/:invoiceNumber/payment-link", updateInvoicePaymentLink);
router.put("/pay/:invoiceNumber", markInvoicePaid);

module.exports = router;