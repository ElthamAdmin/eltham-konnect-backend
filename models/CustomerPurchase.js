const mongoose = require("mongoose");

const customerPurchaseItemSchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },

    unitPrice: {
      type: Number,
      default: 0,
    },

    totalAmount: {
      type: Number,
      default: 0,
    },

    size: {
      type: String,
      default: "",
    },

    colour: {
      type: String,
      default: "",
    },

    productUrl: {
      type: String,
      default: "",
    },
  },
  {
    _id: true,
  }
);

const customerPurchaseSchema = new mongoose.Schema(
  {
    purchaseNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
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

    customerEmail: {
      type: String,
      default: "",
    },

    customerPhone: {
      type: String,
      default: "",
    },

    branch: {
      type: String,
      default: "Eltham Park Mainstore",
      index: true,
    },

    requestDate: {
      type: String,
      default: "",
    },

    purchaseDate: {
      type: String,
      required: true,
      index: true,
    },

    merchant: {
      type: String,
      required: true,
      index: true,
    },

    website: {
      type: String,
      default: "",
    },

    orderNumber: {
      type: String,
      default: "",
      index: true,
    },

    items: {
      type: [customerPurchaseItemSchema],
      default: [],
    },

    purchaseCurrency: {
      type: String,
      default: "USD",
      uppercase: true,
    },

    purchaseAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    exchangeRate: {
      type: Number,
      default: 1,
      min: 0,
    },

    baseCurrency: {
      type: String,
      default: "JMD",
      uppercase: true,
    },

    baseCurrencyAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentAccountNumber: {
      type: String,
      required: true,
      index: true,
    },

    paymentAccountName: {
      type: String,
      required: true,
    },

    paymentAccountType: {
      type: String,
      enum: ["Bank", "Cash", "Credit Card"],
      required: true,
    },

    paymentChartAccountCode: {
      type: String,
      required: true,
      index: true,
    },

    journalEntryNumber: {
      type: String,
      default: "",
      index: true,
    },

    accountTransactionNumber: {
      type: String,
      default: "",
      index: true,
    },

    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      default: null,
      index: true,
    },

    trackingNumber: {
      type: String,
      default: "",
      index: true,
    },

    warehouse: {
      type: String,
      default: "",
    },

    weight: {
      type: Number,
      default: 0,
    },

    chargeableWeight: {
      type: Number,
      default: 0,
    },

    packageReceivedDate: {
      type: Date,
      default: null,
    },

        invoiceNumber: {
      type: String,
      default: "",
      index: true,
    },

    invoiceReady: {
      type: Boolean,
      default: false,
      index: true,
    },

    invoicedAt: {
      type: Date,
      default: null,
    },

    invoiceJournalEntryNumber: {
      type: String,
      default: "",
      index: true,
    },

    invoiceHistory: [
      {
        invoiceNumber: {
          type: String,
          default: "",
        },

        invoiceDate: {
          type: Date,
          default: null,
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

        journalEntryNumber: {
          type: String,
          default: "",
        },

        status: {
          type: String,
          default: "Invoiced",
        },
      },
    ],

    paymentAllocations: [
      {
        invoiceNumber: {
          type: String,
          default: "",
        },

        paymentDate: {
          type: Date,
          default: Date.now,
        },

        paymentAmount: {
          type: Number,
          default: 0,
        },

        journalEntryNumber: {
          type: String,
          default: "",
        },

        receivedBy: {
          type: String,
          default: "",
        },

        remainingBalance: {
          type: Number,
          default: 0,
        },
      },
    ],

    lastPackageSyncAt: {
      type: Date,
      default: null,
    },

    lastPackageStatus: {
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

    totalCustomerCharge: {
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

    recoveryStatus: {
      type: String,
      enum: [
        "Not Invoiced",
        "Invoiced",
        "Partially Paid",
        "Paid",
        "Refunded",
        "Written Off",
      ],
      default: "Not Invoiced",
      index: true,
    },

    status: {
      type: String,
      enum: [
        "Pending Purchase",
        "Purchased",
        "In Transit",
        "At Warehouse",
        "Ready to Invoice",
        "Invoiced",
        "Partially Recovered",
        "Recovered",
        "Cancelled",
        "Refunded",
        "Reversed",
      ],
      default: "Purchased",
      index: true,
    },

    receiptUrl: {
      type: String,
      default: "",
    },

    orderConfirmationUrl: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
    },

    createdBy: {
      type: String,
      default: "System User",
    },

    updatedBy: {
      type: String,
      default: "",
    },

    refundedAmount: {
      type: Number,
      default: 0,
    },

    refundJournalEntryNumber: {
      type: String,
      default: "",
      index: true,
    },

    reversedAt: {
      type: Date,
      default: null,
    },

    reversedBy: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("CustomerPurchase", customerPurchaseSchema);