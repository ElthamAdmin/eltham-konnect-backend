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