const mongoose = require("mongoose");
const { randomUUID } = require("crypto");

const CustomerPolicySchema = new mongoose.Schema(
  {
    policyNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      default: () => `POL-${randomUUID()}`,
    },

    policyType: {
      type: String,
      required: true,
      enum: ["terms", "privacy"],
      immutable: true,
    },

    version: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      immutable: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
      immutable: true,
    },

    effectiveDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      immutable: true,
    },

    status: {
      type: String,
      enum: ["Draft", "Published", "Withdrawn"],
      default: "Draft",
      required: true,
    },

    fileName: {
      type: String,
      required: true,
      maxlength: 200,
      immutable: true,
    },

    mimeType: {
      type: String,
      default: "application/pdf",
      enum: ["application/pdf"],
      immutable: true,
    },

    fileSize: {
      type: Number,
      required: true,
      min: 1,
      max: 10 * 1024 * 1024,
      immutable: true,
    },

    fileSha256: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
      immutable: true,
    },

    storageProvider: {
      type: String,
      default: "cloudinary",
      enum: ["cloudinary"],
      immutable: true,
    },

    cloudinaryPublicId: {
      type: String,
      required: true,
      immutable: true,
      select: false,
    },

    cloudinaryResourceType: {
      type: String,
      default: "raw",
      enum: ["raw"],
      immutable: true,
      select: false,
    },

    cloudinaryDeliveryType: {
      type: String,
      default: "authenticated",
      enum: ["authenticated"],
      immutable: true,
      select: false,
    },

    uploadedByUserId: {
      type: String,
      default: "",
      immutable: true,
    },

    uploadedByName: {
      type: String,
      default: "",
      immutable: true,
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    publishedByUserId: {
      type: String,
      default: "",
    },

    publishedByName: {
      type: String,
      default: "",
    },

    withdrawnAt: {
      type: Date,
      default: null,
    },

    withdrawnByUserId: {
      type: String,
      default: "",
    },

    withdrawnByName: {
      type: String,
      default: "",
    },

    withdrawalReason: {
      type: String,
      default: "",
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

CustomerPolicySchema.index(
  {
    policyType: 1,
    version: 1,
  },
  {
    unique: true,
  }
);

CustomerPolicySchema.index({
  policyType: 1,
  status: 1,
  effectiveDate: -1,
});

module.exports = mongoose.model(
  "CustomerPolicy",
  CustomerPolicySchema
);