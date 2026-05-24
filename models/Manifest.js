const mongoose = require("mongoose");

const ManifestSchema = new mongoose.Schema(
  {
    manifestNumber: {
      type: String,
      required: true,
      unique: true,
    },

    origin: {
      type: String,
      required: true,
      default: "Florida",
    },

    packageCount: {
      type: Number,
      default: 0,
    },

    packages: {
      type: [String],
      default: [],
    },

    status: {
      type: String,
      default: "Created",
      enum: [
        "Created",
        "In Transit",
        "Arrived Jamaica",
        "Completed",
        "Cancelled",
      ],
    },

    // KP / Freight Integration Fields
    externalManifestId: {
      type: String,
      default: "",
    },

    manifestCode: {
      type: String,
      default: "",
    },

    awbNumber: {
      type: String,
      default: "",
    },

    flightDate: {
      type: Date,
      default: null,
    },

    courier: {
      type: String,
      default: "",
    },

    serviceTypeId: {
      type: String,
      default: "",
    },

    totalWeight: {
      type: Number,
      default: 0,
    },

    itemCount: {
      type: Number,
      default: 0,
    },

    integrationSource: {
      type: String,
      default: "",
    },

    lastExternalSyncAt: {
      type: Date,
      default: null,
    },

    rawPayload: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Manifest", ManifestSchema);