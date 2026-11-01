const mongoose = require("mongoose");
const Package = require("../models/Package");
const Setting = require("../models/Setting");

const {
  previewPackageStorage,
} = require("../services/storagePreviewService");

const getPackageStoragePreview = async (req, res) => {
  try {
    const { packageId } = req.params;

    if (!mongoose.isValidObjectId(packageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid package reference.",
      });
    }

    const pkg = await Package.findById(packageId)
      .select(
        "trackingNumber customerEkonId status collectedAt storagePeriod createdAt"
      )
      .lean();

    if (!pkg || pkg.status === "Deleted") {
      return res.status(404).json({
        success: false,
        message: "Package not found.",
      });
    }

        const settings = await Setting.findOne({
      settingKey: "main",
    })
      .select("storageFees.additionalClosures")
      .lean();

    const preview = previewPackageStorage({
      pkg,
      additionalClosures:
        settings?.storageFees?.additionalClosures ?? [],
    });

    res.setHeader("Cache-Control", "private, no-store");

    return res.json({
      success: true,
      message: preview.available
        ? "Storage estimate retrieved."
        : preview.reason,
      data: preview,
    });
  } catch (error) {
    console.error("Storage preview error:", error.message);

    return res.status(409).json({
      success: false,
      message:
        "The storage estimate is not available. Check the notice dates and holiday calendar.",
    });
  }
};

module.exports = {
  getPackageStoragePreview,
};