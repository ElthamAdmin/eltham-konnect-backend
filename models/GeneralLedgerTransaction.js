const mongoose = require("mongoose");

const generalLedgerTransactionSchema = new mongoose.Schema(
  {
    ledgerNumber: {
      type: String,
      required: true,
      unique: true,
    },

    entryNumber: {
      type: String,
      required: true,
    },

    entryDate: {
      type: String,
      required: true,
    },

    accountCode: {
      type: String,
      required: true,
    },

    accountName: {
      type: String,
      required: true,
    },

    accountCategory: {
      type: String,
      default: "",
    },

    normalBalance: {
      type: String,
      enum: ["Debit", "Credit"],
      required: true,
    },

    debit: {
      type: Number,
      default: 0,
    },

    credit: {
      type: Number,
      default: 0,
    },

    runningBalance: {
      type: Number,
      default: 0,
    },

    reference: {
      type: String,
      default: "",
    },

    sourceModule: {
      type: String,
      default: "",
    },

    entityId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "BusinessEntity",
  default: null,
  index: true,
},

entityCode: {
  type: String,
  default: "",
  trim: true,
  index: true,
},

entitySnapshot: {
  type: mongoose.Schema.Types.Mixed,
  default: null,
},

reportingPeriodKey: {
  type: String,
  default: "",
  trim: true,
  index: true,
},
    memo: {
      type: String,
      default: "",
    },

    description: {
  type: String,
  default: "",
},

sourceDocumentType: {
  type: String,
  default: "",
},

sourceDocumentNumber: {
  type: String,
  default: "",
},

sourceDocumentId: {
  type: String,
  default: "",
},

fiscalYear: {
  type: String,
  default: "",
},

accountingPeriod: {
  type: String,
  default: "",
},

branch: {
  type: String,
  default: "",
},

postedBy: {
  type: String,
  default: "",
},

postedAt: {
  type: Date,
  default: null,
},

isReversal: {
  type: Boolean,
  default: false,
},

reversedLedgerNumber: {
  type: String,
  default: "",
},

locked: {
  type: Boolean,
  default: false,
},
  },
  { timestamps: true }
);

generalLedgerTransactionSchema.index({
  entityCode: 1,
  reportingPeriodKey: 1,
  accountCode: 1,
  entryDate: 1,
});

module.exports = mongoose.model(
  "GeneralLedgerTransaction",
  generalLedgerTransactionSchema
);