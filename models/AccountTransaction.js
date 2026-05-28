const mongoose = require("mongoose");

const accountTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
      type: String,
      required: true,
      unique: true,
    },

    accountNumber: {
      type: String,
      required: true,
    },

    accountName: {
      type: String,
      required: true,
    },

    linkedChartAccountCode: {
      type: String,
      default: "",
    },

    journalEntryNumber: {
      type: String,
      default: "",
    },

    ledgerReference: {
      type: String,
      default: "",
    },

    transactionType: {
      type: String,
      enum: [
        "Deposit",
        "Withdrawal",
        "Transfer In",
        "Transfer Out",
        "Invoice Payment",
        "Expense Payment",
        "Credit Card Payment",
        "Payroll Payment",
      ],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    paymentMethod: {
  type: String,
  default: "",
},

amountTendered: {
  type: Number,
  default: 0,
},

changeGiven: {
  type: Number,
  default: 0,
},

    reference: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
    },

    transactionDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "AccountTransaction",
  accountTransactionSchema
);