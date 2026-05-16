const mongoose = require("mongoose");

const accountsPayableSchema = new mongoose.Schema(
  {
    payableNumber: {
      type: String,
      required: true,
      unique: true,
    },

    vendorCode: {
      type: String,
      required: true,
    },

    vendorName: {
      type: String,
      required: true,
    },

    billNumber: {
      type: String,
      default: "",
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

    amount: {
      type: Number,
      required: true,
    },

    amountPaid: {
      type: Number,
      default: 0,
    },

    balanceDue: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: [
        "Unpaid",
        "Partially Paid",
        "Paid",
        "Overdue",
      ],
      default: "Unpaid",
    },

    paymentAccountNumber: {
      type: String,
      default: "",
    },

    paymentAccountName: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "AccountsPayable",
  accountsPayableSchema
);