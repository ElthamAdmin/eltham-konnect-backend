const Manifest = require("../models/Manifest");
const Package = require("../models/Package");

const createManifest = async (req, res) => {
  try {
    const { origin } = req.body;

    const manifest = await Manifest.create({
      manifestNumber: `MFT-${Date.now()}`,
      origin: origin || "Florida",
      packageCount: 0,
      packages: [],
      status: "Created",
    });

    res.json({
      success: true,
      message: "Manifest created",
      data: manifest,
    });
  } catch (error) {
    console.error("Error creating manifest:", error);
    res.status(500).json({
      success: false,
      message: "Could not create manifest",
      error: error.message,
    });
  }
};

const addPackageToManifest = async (req, res) => {
  try {
    const { manifestNumber } = req.params;
    const { trackingNumber } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: "Tracking number is required",
      });
    }

    const manifest = await Manifest.findOne({ manifestNumber });

    if (!manifest) {
      return res.status(404).json({
        success: false,
        message: "Manifest not found",
      });
    }

    if (manifest.status !== "Created") {
      return res.status(400).json({
        success: false,
        message: "Packages can only be added to a manifest with Created status",
      });
    }

    const pkg = await Package.findOne({ trackingNumber });

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    if (manifest.packages.includes(trackingNumber)) {
      return res.status(400).json({
        success: false,
        message: "Package is already on this manifest",
      });
    }

    manifest.packages.push(trackingNumber);
    manifest.packageCount = manifest.packages.length;
    await manifest.save();

    pkg.status = "In Transit";
    await pkg.save();

    res.json({
      success: true,
      message: "Package added to manifest",
      data: manifest,
    });
  } catch (error) {
    console.error("Error adding package to manifest:", error);
    res.status(500).json({
      success: false,
      message: "Package could not be added",
      error: error.message,
    });
  }
};

const departManifest = async (req, res) => {
  try {
    const { manifestNumber } = req.params;

    const manifest = await Manifest.findOne({ manifestNumber });

    if (!manifest) {
      return res.status(404).json({
        success: false,
        message: "Manifest not found",
      });
    }

    manifest.status = "In Transit";
    await manifest.save();

    res.json({
      success: true,
      message: "Manifest departed",
      data: manifest,
    });
  } catch (error) {
    console.error("Error departing manifest:", error);
    res.status(500).json({
      success: false,
      message: "Could not update manifest",
      error: error.message,
    });
  }
};

const arriveManifest = async (req, res) => {
  try {
    const { manifestNumber } = req.params;

    const manifest = await Manifest.findOne({ manifestNumber });

    if (!manifest) {
      return res.status(404).json({
        success: false,
        message: "Manifest not found",
      });
    }

    manifest.status = "Arrived Jamaica";
    await manifest.save();

    await Package.updateMany(
      { trackingNumber: { $in: manifest.packages } },
      { $set: { status: "In Transit to Branch" } }
    );

    res.json({
      success: true,
      message: "Manifest arrived Jamaica",
      data: manifest,
    });
  } catch (error) {
    console.error("Error arriving manifest:", error);
    res.status(500).json({
      success: false,
      message: "Could not update manifest",
      error: error.message,
    });
  }
};

const getManifests = async (req, res) => {
  try {
    const manifests = await Manifest.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: manifests,
    });
  } catch (error) {
    console.error("Error getting manifests:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve manifests",
      error: error.message,
    });
  }
};

module.exports = {
  createManifest,
  addPackageToManifest,
  departManifest,
  arriveManifest,
  getManifests,
};