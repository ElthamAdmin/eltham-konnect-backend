const crypto = require("crypto");
const mongoose = require("mongoose");
const Manifest = require("../models/Manifest");
const Package = require("../models/Package");

const {
  applyPackageStatusDetails,
} = require("./packageController");

const {
  syncCustomerPurchaseFromPackage,
} = require("../services/customerPurchaseIntegrationService");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const readText = (value, label, maxLength = 200) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maxLength
  ) {
    fail(`${label} must contain 1–${maxLength} characters.`);
  }

  return value.trim();
};

const sendError = (res, error) => {
  console.error("Manifest action failed:", error);

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode
      ? error.message
      : "Could not confirm the manifest action. Refresh manifests and packages before retrying.",
  });
};

const findManifest = async (number, session) => {
  const manifest = await Manifest.findOne({
    manifestNumber: readText(number, "Manifest number"),
  }).session(session);

  if (!manifest) fail("Manifest not found.", 404);
  return manifest;
};

const requireCreated = (manifest) => {
  if (manifest.status !== "Created") {
    fail("Only a Created manifest can be edited.", 409);
  }
};

const findManifestPackages = async (manifest, session) => {
  const trackingNumbers = [...new Set(manifest.packages || [])];

  if (trackingNumbers.length !== manifest.packages.length) {
    fail("This manifest contains duplicate tracking references. Review it before proceeding.", 409);
  }

  const packages = await Package.find({
    trackingNumber: { $in: trackingNumbers },
  }).session(session);

  if (packages.length !== trackingNumbers.length) {
    fail("Some manifest packages could not be found. No changes were saved.", 409);
  }

  return packages;
};

const changePackageStatus = async (
  pkg,
  status,
  manifest,
  req,
  session
) => {
  applyPackageStatusDetails(pkg, status, req.user, {
    source: "Manifests",
    reason: `Manifest ${manifest.manifestNumber}`,
  });

  await pkg.save({ session });

  await syncCustomerPurchaseFromPackage({
    pkg,
    user: req.user,
    session,
  });
};

const createManifest = async (req, res) => {
  try {
    const origin = readText(req.body?.origin || "Florida", "Origin");

    const manifest = await Manifest.create({
      manifestNumber: `MFT-${crypto.randomUUID()}`,
      origin,
      packages: [],
      packageCount: 0,
      status: "Created",
    });

    return res.json({
      success: true,
      message: "Manifest created.",
      data: manifest,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const addPackageToManifest = async (req, res) => {
  try {
    const trackingNumber = readText(
      req.body?.trackingNumber,
      "Tracking number"
    );

    const data = await mongoose.connection.transaction(async (session) => {
      const manifest = await findManifest(req.params.manifestNumber, session);
      requireCreated(manifest);

      if (manifest.packages.includes(trackingNumber)) {
        return { manifest, unchanged: true };
      }

      const pkg = await Package.findOne({ trackingNumber }).session(session);
      if (!pkg) fail("Package not found.", 404);

      if (pkg.status !== "At Warehouse") {
        fail("Only a package currently At Warehouse can be assigned to a manifest.", 409);
      }

      const otherManifest = await Manifest.findOne({
        _id: { $ne: manifest._id },
        packages: trackingNumber,
        status: { $in: ["Created", "In Transit", "Arrived Jamaica"] },
      }).session(session);

      if (otherManifest) {
        fail(
          `Package already belongs to active manifest ${otherManifest.manifestNumber}.`,
          409
        );
      }

      manifest.packages.push(trackingNumber);
      manifest.packageCount = manifest.packages.length;

      await changePackageStatus(
        pkg, "Manifest Assigned", manifest, req, session
      );
      await manifest.save({ session });

      return { manifest, unchanged: false };
    });

    return res.json({
      success: true,
      message: data.unchanged
        ? "Package is already on this manifest. No changes made."
        : "Package assigned to manifest.",
      data: data.manifest,
      unchanged: data.unchanged,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const removePackageFromManifest = async (req, res) => {
  try {
    const trackingNumber = readText(
      req.body?.trackingNumber,
      "Tracking number"
    );

    const data = await mongoose.connection.transaction(async (session) => {
      const manifest = await findManifest(req.params.manifestNumber, session);
      requireCreated(manifest);

      if (!manifest.packages.includes(trackingNumber)) {
        return { manifest, unchanged: true };
      }

      const pkg = await Package.findOne({ trackingNumber }).session(session);
      if (!pkg) fail("Package not found. No changes were saved.", 409);

      if (pkg.status !== "Manifest Assigned") {
        fail(
          "This package is no longer Manifest Assigned. Removal will not reset a progressed package.",
          409
        );
      }

      manifest.packages = manifest.packages.filter(
        (number) => number !== trackingNumber
      );
      manifest.packageCount = manifest.packages.length;

      await changePackageStatus(pkg, "At Warehouse", manifest, req, session);
      await manifest.save({ session });

      return { manifest, unchanged: false };
    });

    return res.json({
      success: true,
      message: data.unchanged
        ? "Package is not on this manifest. No changes made."
        : "Package removed and returned to At Warehouse.",
      data: data.manifest,
      unchanged: data.unchanged,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const deleteManifest = async (req, res) => {
  try {
    await mongoose.connection.transaction(async (session) => {
      const manifest = await findManifest(req.params.manifestNumber, session);
      requireCreated(manifest);

      const packages = await findManifestPackages(manifest, session);

      if (packages.some((pkg) => pkg.status !== "Manifest Assigned")) {
        fail(
          "This manifest contains packages that are not Manifest Assigned. Deletion will not reset progressed packages.",
          409
        );
      }

      for (const pkg of packages) {
        await changePackageStatus(pkg, "At Warehouse", manifest, req, session);
      }

      await manifest.deleteOne({ session });
    });

    return res.json({
      success: true,
      message: "Manifest deleted. Assigned packages returned to At Warehouse.",
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const updateManifest = async (req, res) => {
  try {
    const origin = readText(req.body?.origin, "Origin");

    const manifest = await mongoose.connection.transaction(async (session) => {
      const record = await findManifest(req.params.manifestNumber, session);
      requireCreated(record);
      record.origin = origin;
      await record.save({ session });
      return record;
    });

    return res.json({
      success: true,
      message: "Manifest updated.",
      data: manifest,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const departManifest = async (req, res) => {
  try {
    const data = await mongoose.connection.transaction(async (session) => {
      const manifest = await findManifest(req.params.manifestNumber, session);

      if (manifest.status === "In Transit") {
        return { manifest, unchanged: true };
      }

      requireCreated(manifest);
      const packages = await findManifestPackages(manifest, session);

      if (!packages.length) fail("Add packages before departure.", 409);

      if (packages.some((pkg) => pkg.status !== "Manifest Assigned")) {
        fail(
          "Every package must be Manifest Assigned before departure. No changes were saved.",
          409
        );
      }

      for (const pkg of packages) {
        await changePackageStatus(pkg, "In Transit", manifest, req, session);
      }

      manifest.status = "In Transit";
      manifest.packageCount = manifest.packages.length;
      await manifest.save({ session });

      return { manifest, unchanged: false };
    });

    return res.json({
      success: true,
      message: data.unchanged
        ? "Manifest already departed. No changes made."
        : "Manifest and its packages marked In Transit.",
      data: data.manifest,
      unchanged: data.unchanged,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const arriveManifest = async (req, res) => {
  try {
    const data = await mongoose.connection.transaction(async (session) => {
      const manifest = await findManifest(req.params.manifestNumber, session);

      if (manifest.status === "Arrived Jamaica") {
        return { manifest, unchanged: true };
      }

      if (manifest.status !== "In Transit") {
        fail("Only an In Transit manifest can be marked Arrived Jamaica.", 409);
      }

      // Arrival does not certify customs clearance or reset package status.
      manifest.status = "Arrived Jamaica";
      await manifest.save({ session });

      return { manifest, unchanged: false };
    });

    return res.json({
      success: true,
      message: data.unchanged
        ? "Arrival already recorded. No changes made."
        : "Arrival recorded. Customs clearance remains a separate package action.",
      data: data.manifest,
      unchanged: data.unchanged,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const getManifests = async (req, res) => {
  try {
    const manifests = await Manifest.find()
      .select("-rawPayload")
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: manifests });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  createManifest,
  addPackageToManifest,
  removePackageFromManifest,
  deleteManifest,
  updateManifest,
  departManifest,
  arriveManifest,
  getManifests,
};