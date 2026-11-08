const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
  },
  { _id: false }
);

const chargeSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["Warehousing", "Freight", "Surcharge", "Other"],
      required: true,
    },
    description: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
        sourceExpenseNumber: { type: String, default: "" },
    originalJournalEntryNumber: { type: String, default: "" },
    linkingReason: { type: String, default: "" },
    requestId: { type: String, required: true },
    requestHash: { type: String, required: true },
    paymentDate: { type: String, required: true },
    invoiceCurrencyAmount: { type: Number, required: true },
    actualJmdAmount: { type: Number, required: true },
    carryingJmdAmount: { type: Number, required: true },
    exchangeDifference: { type: Number, default: 0 },
    exchangeAdjustmentAccountCode: { type: String, default: "" },
    paymentAccountNumber: { type: String, required: true },
    paymentAccountName: { type: String, required: true },
    paymentMethod: { type: String, required: true },
    paymentReference: { type: String, required: true },
    journalEntryNumber: { type: String, required: true },
    accountTransactionNumber: { type: String, required: true },
    paidBy: { type: String, required: true },
    notes: { type: String, default: "" },
    proof: { type: attachmentSchema, default: undefined },
  },
  { timestamps: true }
);

const freightInvoiceSchema = new mongoose.Schema(
  {
    freightInvoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    vendorCode: { type: String, required: true, index: true },
    vendorName: { type: String, required: true },
    supplierInvoiceNumber: { type: String, required: true },
    supplierInvoiceKey: { type: String, required: true },
    invoiceDate: { type: String, required: true },
    dueDate: { type: String, required: true },
    currency: {
      type: String,
      enum: ["JMD", "USD"],
      required: true,
    },
    exchangeRate: { type: Number, required: true, min: 0 },
    packageCount: { type: Number, default: 0, min: 0 },
    totalWeight: { type: Number, default: 0, min: 0 },
    trackingNumbers: { type: [String], default: [] },
    manifestNumber: { type: String, default: "" },
    charges: { type: [chargeSchema], default: [] },
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, required: true, min: 0 },
    baseCurrencyAmount: { type: Number, required: true },
    expenseAccountCode: { type: String, required: true },
    payableNumber: {
      type: String,
      required: true,
      unique: true,
    },
    journalEntryNumber: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Unpaid", "Partially Paid", "Paid"],
      default: "Unpaid",
      index: true,
    },
    invoiceAttachment: {
      type: attachmentSchema,
      default: undefined,
    },
    paymentHistory: { type: [paymentSchema], default: [] },
    notes: { type: String, default: "" },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

freightInvoiceSchema.index(
  { vendorCode: 1, supplierInvoiceKey: 1 },
  { unique: true, name: "unique_freight_supplier_invoice" }
);

module.exports = mongoose.model("FreightInvoice", freightInvoiceSchema);