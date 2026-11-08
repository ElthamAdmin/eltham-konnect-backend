const mongoose = require("mongoose");

const customerPurchaseRefundSchema = new mongoose.Schema(
  {
    refundNumber: {
      type: String,
      required: true,
      unique: true,
    },

    purchaseNumber: {
      type: String,
      required: true,
      index: true,
    },

    customerEkonId: {
      type: String,
      required: true,
      index: true,
    },

    customerName: {
      type: String,
      required: true,
    },

    invoiceNumber: {
      type: String,
      default: "",
      index: true,
    },

    merchantReference: {
      type: String,
      required: true,
    },

    requestHash: {
      type: String,
      required: true,
    },

    refundDate: {
      type: String,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    invoiceReduction: {
      type: Number,
      default: 0,
      min: 0,
    },

    creditAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    creditRemaining: {
      type: Number,
      default: 0,
      min: 0,
    },

    journalEntryNumber: {
      type: String,
      required: true,
    },

    accountTransactionNumber: {
      type: String,
      required: true,
    },

    notes: {
      type: String,
      default: "",
    },

    createdBy: {
      type: String,
      required: true,
    },

    payouts: [
      {
        reference: {
          type: String,
          required: true,
        },

        amount: {
          type: Number,
          required: true,
          min: 0,
        },

        paymentDate: {
          type: String,
          required: true,
        },

        accountNumber: {
          type: String,
          required: true,
        },

        journalEntryNumber: {
          type: String,
          required: true,
        },

        accountTransactionNumber: {
          type: String,
          required: true,
        },

        paidBy: {
          type: String,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

customerPurchaseRefundSchema.index(
  {
    purchaseNumber: 1,
    merchantReference: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "CustomerPurchaseRefund",
  customerPurchaseRefundSchema
);