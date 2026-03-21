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
      enum: ["Created", "In Transit", "Arrived Jamaica"],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Manifest", ManifestSchema);