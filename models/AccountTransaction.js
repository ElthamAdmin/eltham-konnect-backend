const mongoose = require("mongoose");

const accountTransactionSchema = new mongoose.Schema({

  transactionNumber: {
    type: String,
    required: true
  },

  accountNumber: {
    type: String,
    required: true
  },

  accountName: {
    type: String,
    required: true
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
      "Credit Card Payment"
    ],
    required: true
  },

  amount: {
    type: Number,
    required: true
  },

  reference: {
    type: String,
    default: ""
  },

  notes: {
    type: String,
    default: ""
  },

  transactionDate: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model("AccountTransaction", accountTransactionSchema);