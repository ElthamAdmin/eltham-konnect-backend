const mongoose = require("mongoose");

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
    originalName: { type: String, default: "" },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    uploadedBy: { type: String, required: true },
    status: { type: String, default: "Active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamHubDocument", TeamHubDocumentSchema);