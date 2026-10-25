const mongoose = require("mongoose");

const CompanyDocumentSchema = new mongoose.Schema(
  {
    documentNumber: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      default: "General",
    },
    fileName: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      required: true,
      default: "application/pdf",
    },
        storageProvider: {
      type: String,
      default: "",
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

    fileSize: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      default: "Active",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("CompanyDocument", CompanyDocumentSchema);