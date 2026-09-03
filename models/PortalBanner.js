const mongoose = require("mongoose");

const PortalBannerSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },

    type: {
      type: String,
      enum: ["Information", "Important", "Urgent"],
      default: "Information",
      index: true,
    },

    linkUrl: {
      type: String,
      default: "",
      trim: true,
    },

    linkLabel: {
      type: String,
      default: "",
      trim: true,
      maxlength: 40,
    },

    startAt: {
      type: Date,
      required: true,
      index: true,
    },

    endAt: {
      type: Date,
      required: true,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },

    createdBy: {
      type: String,
      default: "",
      trim: true,
    },

    updatedBy: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

PortalBannerSchema.index({
  isActive: 1,
  isArchived: 1,
  startAt: 1,
  endAt: 1,
});

module.exports = mongoose.model("PortalBanner", PortalBannerSchema);