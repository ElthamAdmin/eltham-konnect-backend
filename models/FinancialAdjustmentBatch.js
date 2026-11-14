const mongoose = require("mongoose");

const financialAdjustmentLineSchema = new mongoose.Schema(
  {
    accountNumber: {
      type: String,
      trim: true,
    },

    accountName: String,

    accountType: String,

    linkedChartAccountCode: {
      type: String,
      trim: true,
    },

    currency: {
      type: String,
      default: "JMD",
      trim: true,
      uppercase: true,
    },

    exchangeRate: {
      type: Number,
      default: null,
    },

    // Unknown balances must remain unknown rather than becoming zero.
    ledgerBalance: {
      type: Number,
      default: null,
    },

    actualBalance: {
      type: Number,
      default: null,
    },

    ledgerBaseBalance: {
      type: Number,
      default: null,
    },

    actualBaseBalance: {
      type: Number,
      default: null,
    },

    difference: {
      type: Number,
      default: null,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    evidenceReferences: {
      type: [String],
      default: [],
    },

    // Explicit accounting destination for the other side of the correction.
    // The service must validate this; no automatic equity offset is assumed.
    offsetChartAccountCode: {
      type: String,
      default: "",
      trim: true,
    },

    offsetChartAccountName: {
      type: String,
      default: "",
      trim: true,
    },

    adjustmentExplanation: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const adjustmentAuditEventSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
    },

    actorId: {
      type: String,
      required: true,
    },

    actorName: {
      type: String,
      default: "",
    },

    occurredAt: {
      type: Date,
      default: Date.now,
    },

    reason: {
      type: String,
      default: "",
    },

    contentHash: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const financialAdjustmentBatchSchema = new mongoose.Schema(
  {
    batchNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Existing batches remain legacy version 1.
    // The new controlled service will explicitly create version 2 batches.
    workflowVersion: {
      type: Number,
      enum: [1, 2],
      default: 1,
      immutable: true,
    },

    effectiveDate: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    adjustmentReason: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "Draft",
        "Submitted",
        "Approved",
        "Rejected",
        "Posted",
        "Cancelled",
      ],
      default: "Draft",
      index: true,
    },

    businessEntityCode: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    baseCurrency: {
      type: String,
      default: "JMD",
      enum: ["JMD"],
    },

    lines: {
      type: [financialAdjustmentLineSchema],
      default: [],
    },

    evidenceReferences: {
      type: [String],
      default: [],
    },

    // Server-generated fingerprints, never trusted from browser input.
    reviewSnapshotHash: {
      type: String,
      default: "",
    },

    reviewGeneratedAt: {
      type: Date,
      default: null,
    },

    contentHash: {
      type: String,
      default: "",
    },

    approvedContentHash: {
      type: String,
      default: "",
    },

        ownershipReview: {
      type: [
        {
          accountNumber: {
            type: String,
            required: true,
            trim: true,
          },

          entityCode: {
            type: String,
            required: true,
            trim: true,
          },

          evidenceReferences: {
            type: [String],
            default: [],
          },

          notes: {
            type: String,
            default: "",
            trim: true,
          },

          _id: false,
        },
      ],
      default: [],
    },

    journalEntryNumber: {
      type: String,
      default: "",
      index: true,
    },

    createdBy: {
      type: String,
      default: "System User",
    },

    createdById: {
      type: String,
      default: "",
    },

    submittedBy: {
      type: String,
      default: "",
    },

    submittedById: {
      type: String,
      default: "",
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    approvedBy: {
      type: String,
      default: "",
    },

    approvedById: {
      type: String,
      default: "",
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    approvalNotes: {
      type: String,
      default: "",
    },

    rejectedBy: {
      type: String,
      default: "",
    },

    rejectedById: {
      type: String,
      default: "",
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: "",
    },

    postedBy: {
      type: String,
      default: "",
    },

    postedById: {
      type: String,
      default: "",
    },

    postedAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: String,
      default: "",
    },

    cancelledById: {
      type: String,
      default: "",
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      default: "",
    },

    auditEvents: {
      type: [adjustmentAuditEventSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  }
);

module.exports = mongoose.model(
  "FinancialAdjustmentBatch",
  financialAdjustmentBatchSchema
);