const mongoose = require("mongoose");

const TeamHubFolderSchema = new mongoose.Schema(
  {
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamChannel",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    folderPath: { type: String, required: true, trim: true },
    parentFolderPath: { type: String, default: "", trim: true },
    createdByUserId: { type: String, required: true },
    createdByName: { type: String, default: "" },
    status: { type: String, default: "Active" },
  },
  { timestamps: true }
);

TeamHubFolderSchema.index({ channelId: 1, folderPath: 1 }, { unique: true });

module.exports = mongoose.model("TeamHubFolder", TeamHubFolderSchema);