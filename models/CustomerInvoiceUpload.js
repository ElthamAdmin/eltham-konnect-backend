const mongoose = require("mongoose");

const CustomerInvoiceUploadSchema = new mongoose.Schema(
  {
    uploadNumber: {
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

    trackingNumber: {
      type: String,
      default: "",
    },

    invoiceNumber: {
      type: String,
      default: "",
    },

    fileName: {
      type: String,
      required: true,
    },

    filePath: {
      type: String,
      required: true,
    },

        storageProvider: {
      type: String,
      enum: ["local", "cloudinary"],
      default: "local",
    },

    cloudinaryPublicId: {
      type: String,
      default: "",
    },

    cloudinaryResourceType: {
      type: String,
      default: "",
    },

    cloudinaryDeliveryType: {
      type: String,
      default: "",
    },

    mimeType: {
      type: String,
      default: "",
    },

    fileSize: {
      type: Number,
      default: 0,
    },

    notes: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      default: "Uploaded",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("CustomerInvoiceUpload", CustomerInvoiceUploadSchema);