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
      customerPurchaseNumber: {
        type: String,
        default: "",
      },
    },
  ],

  invoiceSource: {
    type: String,
    enum: ["Packages", "Customer Purchases", "Combined"],
    default: "Packages",
    index: true,
  },

  customerPurchaseCount: {
    type: Number,
    default: 0,
  },

  customerPurchases: [
    {
      purchaseNumber: {
        type: String,
        required: true,
      },

      merchant: {
        type: String,
        default: "",
      },

      orderNumber: {
        type: String,
        default: "",
      },

      trackingNumber: {
        type: String,
        default: "",
      },

      itemRecoveryAmount: {
        type: Number,
        default: 0,
      },

      shoppingAssistanceFee: {
        type: Number,
        default: 0,
      },

      weightCharge: {
        type: Number,
        default: 0,
      },

      shippingCharge: {
        type: Number,
        default: 0,
      },

      customsDuty: {
        type: Number,
        default: 0,
      },

      deliveryFee: {
        type: Number,
        default: 0,
      },

      otherCharges: {
        type: Number,
        default: 0,
      },

      allocatedInvoiceAmount: {
        type: Number,
        default: 0,
      },

      recoveredAmount: {
        type: Number,
        default: 0,
      },

      outstandingAmount: {
        type: Number,
        default: 0,
      },
    },
  ],

  customerPurchaseRecoveryAmount: {
    type: Number,
    default: 0,
  },

  shoppingAssistanceFee: {
    type: Number,
    default: 0,
  },

  customerPurchaseWeightCharge: {
    type: Number,
    default: 0,
  },

  customerPurchaseShippingCharge: {
    type: Number,
    default: 0,
  },

  customerPurchaseCustomsDuty: {
    type: Number,
    default: 0,
  },

  customerPurchaseDeliveryFee: {
    type: Number,
    default: 0,
  },

  customerPurchaseOtherCharges: {
    type: Number,
    default: 0,
  },

  customerPurchaseTotal: {
    type: Number,
    default: 0,
  },

  customerPurchaseJournalEntryNumber: {
    type: String,
    default: "",
    index: true,
  },

  subtotal: {
    type: Number,
    default: 0,
  },

  customsDuty: {
    type: Number,
    default: 0,
  },

    businessEntitySnapshot: {
    entityCode: {
      type: String,
      default: "EK-SP-2026",
      trim: true,
    },

    legalName: {
      type: String,
      default: "Eltham Konnect",
      trim: true,
    },

    businessType: {
      type: String,
      enum: [
        "Sole Proprietorship",
        "Limited Liability Company",
        "Partnership",
      ],
      default: "Sole Proprietorship",
    },

    registrationNumber: {
      type: String,
      default: "",
      trim: true,
    },

    trn: {
      type: String,
      default: "",
      trim: true,
    },

    effectiveFrom: {
      type: String,
      default: "",
    },
  },

  gctTreatment: {
    registrationStatus: {
      type: String,
      enum: [
        "Not Registered",
        "Registered",
        "Suspended",
        "Deregistered",
      ],
      default: "Not Registered",
      index: true,
    },

    registrationNumber: {
      type: String,
      default: "",
      trim: true,
    },

    registrationEffectiveDate: {
      type: String,
      default: "",
    },

    treatment: {
      type: String,
      enum: [
        "Not Registered",
        "Taxable Supply",
        "Zero-Rated Supply",
        "Exempt Supply",
        "Outside Scope",
        "Mixed Supply",
      ],
      default: "Not Registered",
      index: true,
    },

    rate: {
      type: Number,
      default: 0,
      min: 0,
    },

    taxableAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    outputGct: {
      type: Number,
      default: 0,
      min: 0,
    },

    reason: {
      type: String,
      default:
        "Business is not currently registered for GCT.",
      trim: true,
    },

    ruleCode: {
      type: String,
      default: "",
      trim: true,
    },

    calculatedAt: {
      type: Date,
      default: null,
    },
  },

  turnoverClassification: {
    grossInvoiceAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    customerPurchaseRecovery: {
      type: Number,
      default: 0,
      min: 0,
    },

    serviceRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },

    potentiallyTaxableTurnover: {
      type: Number,
      default: 0,
      min: 0,
    },

    exemptTurnover: {
      type: Number,
      default: 0,
      min: 0,
    },

    zeroRatedTurnover: {
      type: Number,
      default: 0,
      min: 0,
    },

    outsideScopeAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    classificationStatus: {
      type: String,
      enum: [
        "Not Classified",
        "Automatically Classified",
        "Reviewed",
        "Adjusted",
      ],
      default: "Not Classified",
      index: true,
    },

    classificationNotes: {
      type: String,
      default: "",
      trim: true,
    },

    classifiedAt: {
      type: Date,
      default: null,
    },

    classifiedBy: {
      type: String,
      default: "",
      trim: true,
    },
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
  enum: [
    "Normal",
    "Reminder Sent",
    "Contacted",
    "No Answer",
    "Follow Up",
    "Promise To Pay",
    "Payment Arrangement",
    "Overdue",
    "Final Notice",
    "Collections",
    "Legal Review",
    "Written Off",
  ],
  default: "Normal",
},

assignedCollector: {
  type: String,
  default: "",
},

lastCollectionContact: {
  type: Date,
  default: null,
},

nextFollowUpDate: {
  type: Date,
  default: null,
},

promiseToPayDate: {
  type: Date,
  default: null,
},

promiseToPayAmount: {
  type: Number,
  default: 0,
},

promiseToPayStatus: {
  type: String,
  enum: ["None", "Pending", "Fulfilled", "Broken"],
  default: "None",
},

collectionNotes: [
  {
    note: String,
    createdBy: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
],

writeOffStatus: {
  type: String,
  enum: ["None", "Pending Approval", "Approved", "Rejected", "Written Off", "Recovered"],
  default: "None",
},

writeOffReason: {
  type: String,
  default: "",
},

writeOffNotes: {
  type: String,
  default: "",
},

writeOffAmount: {
  type: Number,
  default: 0,
},

writeOffRequestedBy: {
  type: String,
  default: "",
},

writeOffRequestedAt: {
  type: Date,
  default: null,
},

writeOffApprovedBy: {
  type: String,
  default: "",
},

writeOffApprovedAt: {
  type: Date,
  default: null,
},

writeOffJournalEntryNumber: {
  type: String,
  default: "",
},

writeOffRecoveredAmount: {
  type: Number,
  default: 0,
},

writeOffRecoveredAt: {
  type: Date,
  default: null,
},

recoveryJournalEntryNumber: {
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