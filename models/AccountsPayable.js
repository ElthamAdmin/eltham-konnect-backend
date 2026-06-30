const mongoose = require("mongoose");

const paymentHistorySchema = new mongoose.Schema(
  {
    paymentDate: {
      type: String,
      required: true,
    },

    paymentAmount: {
      type: Number,
      required: true,
    },

    paymentAccountNumber: {
      type: String,
      required: true,
    },

    paymentAccountName: {
      type: String,
      required: true,
    },

    paymentMethod: {
      type: String,
      default: "Bank Transfer",
    },

    paymentReference: {
      type: String,
      required: true,
    },

    journalEntryNumber: {
      type: String,
      default: "",
    },

    accountTransactionNumber: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
    },

    paidBy: {
      type: String,
      default: "System User",
    },
  },
  { _id: false }
);

const accountsPayableSchema = new mongoose.Schema(
  {
    payableNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    vendorCode: {
      type: String,
      required: true,
      index: true,
    },

    vendorName: {
      type: String,
      required: true,
    },

    billNumber: {
      type: String,
      default: "",
      index: true,
    },

    payableDate: {
      type: String,
      required: true,
    },

    dueDate: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    expenseAccountCode: {
      type: String,
      default: "6000",
      index: true,
    },

    expenseAccountName: {
      type: String,
      default: "",
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    balanceDue: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["Draft", "Unpaid", "Partially Paid", "Paid", "Overdue", "Void"],
      default: "Unpaid",
      index: true,
    },

    approvalStatus: {
      type: String,
      enum: ["Not Required", "Pending", "Approved", "Rejected"],
      default: "Not Required",
      index: true,
    },

    journalEntryNumber: {
      type: String,
      default: "",
      index: true,
    },

    paymentAccountNumber: {
      type: String,
      default: "",
    },

    paymentAccountName: {
      type: String,
      default: "",
    },

    lastPaymentDate: {
      type: String,
      default: "",
    },

    paymentHistory: {
      type: [paymentHistorySchema],
      default: [],
    },

    notes: {
      type: String,
      default: "",
    },

    createdBy: {
      type: String,
      default: "System User",
    },

    approvedBy: {
      type: String,
      default: "",
    },

    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AccountsPayable", accountsPayableSchema);