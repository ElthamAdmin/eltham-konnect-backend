const mongoose = require("mongoose");

const reconciliationItemSchema = new mongoose.Schema({
  transactionNumber: {
    type: String,
    default: "",
  },

  transactionType: {
    type: String,
    default: "",
  },

  amount: {
    type: Number,
    default: 0,
  },

  transactionDate: {
    type: Date,
    default: Date.now,
  },

  reference: {
    type: String,
    default: "",
  },

  reconciled: {
    type: Boolean,
    default: false,
  },
});

const bankReconciliationSchema = new mongoose.Schema(
  {
    reconciliationNumber: {
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

    statementDate: {
      type: String,
      required: true,
    },

    bankStatementBalance: {
      type: Number,
      default: 0,
    },

    systemBalance: {
      type: Number,
      default: 0,
    },

    adjustedBalance: {
      type: Number,
      default: 0,
    },

    difference: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["Balanced", "Out of Balance"],
      default: "Out of Balance",
    },

    notes: {
      type: String,
      default: "",
    },

    reconciliationItems: [reconciliationItemSchema],

    completedBy: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "BankReconciliation",
  bankReconciliationSchema
);