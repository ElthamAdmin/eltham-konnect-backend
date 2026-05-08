const UnmatchedPackage = require("../models/UnmatchedPackage");

const getUnmatchedPackages = async (req, res) => {
  try {
    const packages = await UnmatchedPackage.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Unmatched packages retrieved successfully",
      totalPackages: packages.length,
      data: packages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load unmatched packages.",
      error: error.message,
    });
  }
};

module.exports = {
  getUnmatchedPackages,
};