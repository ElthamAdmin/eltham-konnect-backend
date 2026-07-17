const mongoose = require("mongoose");

const ExpenseSchema = new mongoose.Schema({
  expenseNumber: {
    type: String,
    required: true,
    unique: true,
  },
  date: {
    type: String,
    required: true,
  },
    category: {
    type: String,
    required: true,
  },

  expenseClassification: {
    type: String,
    enum: ["Cost of Goods Sold", "Operating Expense"],
    default: "Operating Expense",
    index: true,
  },

  expenseGroup: {
    type: String,
    default: "",
    index: true,
  },

  linkedChartAccountCode: {
    type: String,
    default: "",
    index: true,
  },

  linkedChartAccountName: {
    type: String,
    default: "",
  },

  isCOGS: {
    type: Boolean,
    default: false,
    index: true,
  },

    branch: {
    type: String,
    default: "All Branches",
    index: true,
  },

  costCenter: {
    type: String,
    default: "General",
    index: true,
  },

  description: {
    type: String,
    required: true,
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
  },

  gctTreatment: {
    businessRegistrationStatus: {
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

    supplierName: {
      type: String,
      default: "",
      trim: true,
    },

    supplierTrn: {
      type: String,
      default: "",
      trim: true,
    },

    supplierGctRegistrationNumber: {
      type: String,
      default: "",
      trim: true,
    },

    supplierInvoiceNumber: {
      type: String,
      default: "",
      trim: true,
    },

    amountExcludingGct: {
      type: Number,
      default: 0,
      min: 0,
    },

    inputGctPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    inputGctClaimable: {
      type: Boolean,
      default: false,
      index: true,
    },

    claimStatus: {
      type: String,
      enum: [
        "Not Claimable",
        "Potentially Claimable",
        "Claimed",
        "Rejected",
        "Adjusted",
      ],
      default: "Not Claimable",
      index: true,
    },

    nonClaimReason: {
      type: String,
      default:
        "Business is not currently registered for GCT.",
      trim: true,
    },

    supportingDocumentVerified: {
      type: Boolean,
      default: false,
    },

    verifiedBy: {
      type: String,
      default: "",
      trim: true,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    filingPeriodKey: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
  },
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    default: "Paid",
  },
  paidFromAccountNumber: {
    type: String,
    default: "",
  },
  paidFromAccountName: {
    type: String,
    default: "",
  },
  receiptUrl: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Expense", ExpenseSchema);