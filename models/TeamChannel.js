const mongoose = require("mongoose");

const TeamChannelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    isPrivate: { type: Boolean, default: false },
    members: [{ type: String }],
    owners: [{ type: String }],
    createdBy: { type: String, required: true },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamChannel", TeamChannelSchema);