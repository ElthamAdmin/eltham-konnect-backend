const mongoose = require("mongoose");

const PackageEditHistorySchema = new mongoose.Schema(
  {
    editedAt: {
      type: Date,
      default: Date.now,
    },

    editedByUserId: {
      type: String,
      default: "",
    },

    editedByName: {
      type: String,
      default: "",
    },

    editedByRole: {
      type: String,
      default: "",
    },

    reason: {
      type: String,
      required: true,
    },

    beforeValues: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    afterValues: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    _id: true,
  }
);

const PackageSchema = new mongoose.Schema(
  {
    trackingNumber: {
      type: String,
      required: true,
      unique: true,
    },

    trackingNumberAliases: {
      type: [String],
      default: [],
      index: true,
    },

    customerEkonId: {
      type: String,
      required: true,
    },

    customerName: {
      type: String,
      required: true,
    },

    courier: {
      type: String,
      default: "",
    },

    integrationSource: {
      type: String,
      default: "",
    },

    externalWarehouseId: {
      type: String,
      default: "",
    },

    externalPackageId: {
      type: String,
      default: "",
    },

    externalStatus: {
      type: String,
      default: "",
    },

    lastExternalSyncAt: {
      type: Date,
      default: null,
    },

    syncNotes: {
      type: String,
      default: "",
    },

    weight: {
      type: Number,
      default: 0,
    },

    manualWeightOverride: {
      type: Boolean,
      default: false,
    },

    latestExternalWeight: {
      type: Number,
      default: null,
    },

    customerPurchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerPurchase",
      default: null,
      index: true,
    },

    customerPurchaseNumber: {
      type: String,
      default: "",
      index: true,
    },

    customerPurchaseLinked: {
      type: Boolean,
      default: false,
      index: true,
    },

    customerPurchaseLinkedAt: {
      type: Date,
      default: null,
    },

    customerPurchaseLinkedBy: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      default: "At Warehouse",
    },

    warehouseLocation: {
      type: String,
      default: "",
    },

    invoiceStatus: {
      type: String,
      default: "Pending",
    },

    readyForPickup: {
      type: Boolean,
      default: false,
    },

    readyForPickupDate: {
      type: Date,
      default: null,
    },

        pickupNotificationNumber: {
      type: String,
      default: "",
    },

    pickupNotifiedAt: {
      type: Date,
      default: null,
    },

    collectedAt: {
      type: Date,
      default: null,
    },

    collectedByUserId: {
      type: String,
      default: "",
    },

    collectedByName: {
      type: String,
      default: "",
    },

    statusUpdatedAt: {
      type: Date,
      default: Date.now,
    },

    dateReceived: {
      type: Date,
      default: Date.now,
    },

    addedByUserId: {
      type: String,
      default: "",
    },

    addedByName: {
      type: String,
      default: "System User",
    },

    addedByEmail: {
      type: String,
      default: "",
    },

    addedByRole: {
      type: String,
      default: "",
    },

    customerInvoiceUploaded: {
      type: Boolean,
      default: false,
    },

    customerInvoiceUploadNumber: {
      type: String,
      default: "",
    },

    customerInvoiceNumber: {
      type: String,
      default: "",
    },

    customerInvoiceFileName: {
      type: String,
      default: "",
    },

    customerInvoiceFilePath: {
      type: String,
      default: "",
    },

    customerInvoiceNotes: {
      type: String,
      default: "",
    },

    customerInvoiceUploadedAt: {
      type: Date,
      default: null,
    },

    editVersion: {
      type: Number,
      default: 0,
    },

    lastEditedAt: {
      type: Date,
      default: null,
    },

    lastEditedByUserId: {
      type: String,
      default: "",
    },

    lastEditedByName: {
      type: String,
      default: "",
    },

    editHistory: {
      type: [PackageEditHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Package", PackageSchema);