const mongoose = require("mongoose");

const taxDocumentSchema = new mongoose.Schema(
  {
    documentNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessEntity",
      required: true,
      index: true,
    },

    entityCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    entitySnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    taxType: {
      type: String,
      enum: [
        "GCT",
        "PAYE",
        "NIS",
        "NHT",
        "Education Tax",
        "HEART",
        "Pension",
        "Income Tax",
        "Company Tax",
        "Other",
      ],
      required: true,
      index: true,
    },

    documentType: {
      type: String,
      enum: [
        "Registration Certificate",
        "Tax Return",
        "Filing Confirmation",
        "Payment Receipt",
        "Payment Confirmation",
        "Assessment",
        "Notice",
        "Correspondence",
        "Supporting Schedule",
        "Supplier Tax Invoice",
        "Customer Tax Invoice",
        "Other",
      ],
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    periodKey: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    periodStart: {
      type: Date,
      default: null,
      index: true,
    },

    periodEnd: {
      type: Date,
      default: null,
      index: true,
    },

    taxRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxRecord",
      default: null,
      index: true,
    },

    taxNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    incomeTaxEstimateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncomeTaxEstimate",
      default: null,
      index: true,
    },

    estimateNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    gctFilingPeriodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GctFilingPeriod",
      default: null,
      index: true,
    },

    filingNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    externalReference: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    receiptNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    documentDate: {
      type: Date,
      required: true,
      index: true,
    },

    receivedDate: {
      type: Date,
      default: null,
    },

    fileName: {
      type: String,
      required: true,
      trim: true,
    },

    fileUrl: {
      type: String,
      required: true,
      trim: true,
    },

    mimeType: {
      type: String,
      default: "",
      trim: true,
    },

    fileSize: {
      type: Number,
      default: 0,
      min: 0,
    },

    storageProvider: {
      type: String,
      enum: [
        "External URL",
        "Cloudinary",
        "S3",
        "Google Drive",
        "SharePoint",
        "Other",
      ],
      default: "External URL",
    },

    checksum: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    verificationStatus: {
      type: String,
      enum: [
        "Unverified",
        "Verified",
        "Rejected",
        "Superseded",
      ],
      default: "Unverified",
      index: true,
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

    verificationNotes: {
      type: String,
      default: "",
      trim: true,
    },

    confidential: {
      type: Boolean,
      default: true,
      index: true,
    },

    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    uploadedBy: {
      type: String,
      default: "",
      trim: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

taxDocumentSchema.index({
  entityCode: 1,
  taxType: 1,
  periodKey: 1,
  documentType: 1,
});

taxDocumentSchema.pre(
  "validate",
  function validateTaxDocument() {
    if (
      this.periodStart &&
      this.periodEnd &&
      this.periodEnd < this.periodStart
    ) {
      throw new Error(
        "The tax-document period end cannot be earlier than its start."
      );
    }

    if (
      this.verificationStatus === "Verified" &&
      (!this.verifiedBy || !this.verifiedAt)
    ) {
      throw new Error(
        "Verified tax documents require the verifier and verification date."
      );
    }
  }
);

module.exports = mongoose.model(
  "TaxDocument",
  taxDocumentSchema
);