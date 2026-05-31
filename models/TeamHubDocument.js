const mongoose = require("mongoose");

const TeamHubDocumentVersionSchema = new mongoose.Schema(
  {
    versionNumber: { type: Number, required: true },
    originalName: { type: String, default: "" },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    uploadedBy: { type: String, default: "" },
    uploadedByName: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
    notes: { type: String, default: "" },
  },
  { _id: true }
);

const TeamHubDocumentSchema = new mongoose.Schema(
  {
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamChannel",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    folder: { type: String, default: "General", trim: true },
    folderPath: { type: String, default: "General", trim: true },
    parentFolder: { type: String, default: "", trim: true },

    originalName: { type: String, default: "" },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    uploadedBy: { type: String, required: true },
    uploadedByName: { type: String, default: "" },

    currentVersion: { type: Number, default: 1 },
    versions: [TeamHubDocumentVersionSchema],

    isLocked: { type: Boolean, default: false },
    lockedByUserId: { type: String, default: "" },
    lockedByName: { type: String, default: "" },
    lockedAt: { type: Date, default: null },

    status: { type: String, default: "Active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamHubDocument", TeamHubDocumentSchema);