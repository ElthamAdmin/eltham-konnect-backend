const mongoose = require("mongoose");

const journalEntryLineSchema = new mongoose.Schema({
  accountCode: {
    type: String,
    required: true,
  },

  accountName: {
    type: String,
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

  description: {
    type: String,
    default: "",
  },
});

const journalEntrySchema = new mongoose.Schema(
  {
    entryNumber: {
      type: String,
      required: true,
      unique: true,
    },

    entryDate: {
      type: String,
      required: true,
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

    memo: {
      type: String,
      default: "",
    },

    totalDebit: {
      type: Number,
      default: 0,
    },

    totalCredit: {
      type: Number,
      default: 0,
    },

    status: {
  type: String,
  enum: ["Draft", "Pending Approval", "Approved", "Posted", "Reversed"],
  default: "Posted",
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

postedBy: {
  type: String,
  default: "",
},

postedAt: {
  type: Date,
  default: null,
},

approvedBy: {
  type: String,
  default: "",
},

approvedAt: {
  type: Date,
  default: null,
},

reversedBy: {
  type: String,
  default: "",
},

reversedAt: {
  type: Date,
  default: null,
},

reversalEntryNumber: {
  type: String,
  default: "",
},

reversalReason: {
  type: String,
  default: "",
},

locked: {
  type: Boolean,
  default: false,
},

    lines: [journalEntryLineSchema],

    createdBy: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "JournalEntry",
  journalEntrySchema
);