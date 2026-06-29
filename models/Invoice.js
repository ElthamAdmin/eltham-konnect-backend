const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
  },

  customerEkonId: {
    type: String,
    required: true,
  },

  customerName: {
    type: String,
    required: true,
  },

  packageCount: {
    type: Number,
    default: 0,
  },

  packages: [
    {
      trackingNumber: String,
      chargeableWeight: Number,
      rate: Number,
    },
  ],

  subtotal: {
    type: Number,
    default: 0,
  },

  customsDuty: {
    type: Number,
    default: 0,
  },

  gct: {
    type: Number,
    default: 0,
  },

  processingFee: {
    type: Number,
    default: 0,
  },

  deliveryFee: {
  type: Number,
  default: 0,
},

deliveryType: {
  type: String,
  default: "",
},

  otherAdjustment: {
    type: Number,
    default: 0,
  },

  adjustmentNote: {
    type: String,
    default: "",
  },

  pointsRedeemed: {
    type: Number,
    default: 0,
  },

  finalTotal: {
    type: Number,
    default: 0,
  },

  amountPaid: {
  type: Number,
  default: 0,
},

balanceDue: {
  type: Number,
  default: 0,
},

dueDate: {
  type: String,
  default: "",
},

paymentTerms: {
  type: String,
  default: "Due on Receipt",
},

paymentHistory: [
  {
    paymentDate: Date,
    amount: Number,
    paymentMethod: String,
    receivingAccountNumber: String,
    receivingAccountName: String,
    journalEntryNumber: String,
    receivedBy: String,
  },
],

collectionsStatus: {
  type: String,
  enum: ["Normal", "Follow Up", "Overdue", "Collections", "Written Off"],
  default: "Normal",
},

writeOffJournalEntryNumber: {
  type: String,
  default: "",
},

journalEntryNumber: {
  type: String,
  default: "",
},

journalStatus: {
  type: String,
  enum: [
    "Not Posted",
    "Posted",
    "Adjusted",
    "Reversed",
  ],
  default: "Not Posted",
},

journalPostedAt: {
  type: Date,
  default: null,
},

  status: {
    type: String,
    enum: [
  "Draft",
  "Unpaid",
  "Partially Paid",
  "Paid",
  "Cancelled",
  "Written Off",
  "Refunded",
],

default: "Unpaid",
  },

  paymentLink: {
    type: String,
    default: "",
  },

  paidDate: {
    type: String,
    default: null,
  },

  paidAt: {
    type: Date,
    default: null,
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

paidIntoAccountNumber: {
  type: String,
  default: "",
},

paidIntoAccountName: {
  type: String,
  default: "",
},

cashierName: {
  type: String,
  default: "",
},

  createdAt: {
    type: String,
    default: () => new Date().toISOString().split("T")[0],
  },
});

module.exports = mongoose.model("Invoice", InvoiceSchema);