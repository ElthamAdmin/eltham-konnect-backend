const {
  previewStorageLaunch,
} = require("../services/storageNoticeService");

const getStorageLaunchPreview = async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    const preview = await previewStorageLaunch();

    return res.json({
      success: true,
      data: preview,
    });
  } catch (error) {
    console.error("Storage launch preview failed:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load the storage launch preview.",
    });
  }
};

module.exports = {
  getStorageLaunchPreview,
};