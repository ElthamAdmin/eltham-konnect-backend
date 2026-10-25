const Package = require("../models/Package");

const findPackageByTrackingNumber = async (trackingNumber) => {
  if (typeof trackingNumber !== "string") {
    throw new Error("Tracking number must be text.");
  }

  const normalizedTrackingNumber = trackingNumber.trim();

  if (!normalizedTrackingNumber) {
    return null;
  }

  return Package.findOne({
    $or: [
      { trackingNumber: normalizedTrackingNumber },
      { trackingNumberAliases: normalizedTrackingNumber },
    ],
  });
};

module.exports = {
  findPackageByTrackingNumber,
};