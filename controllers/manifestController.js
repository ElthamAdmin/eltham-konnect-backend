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

    const manifest = await Manifest.findOne({ manifestNumber });
    if (!manifest) return res.status(404).json({ success: false, message: "Manifest not found" });

    if (manifest.status !== "Created") {
      return res.status(400).json({
        success: false,
        message: "Cannot modify manifest after departure",
      });
    }

    const pkg = await Package.findOne({ trackingNumber });
    if (!pkg) return res.status(404).json({ success: false, message: "Package not found" });

    if (manifest.packages.includes(trackingNumber)) {
      return res.status(400).json({
        success: false,
        message: "Package already added",
      });
    }

    manifest.packages.push(trackingNumber);
    manifest.packageCount = manifest.packages.length;
    await manifest.save();

    pkg.status = "In Transit";
    await pkg.save();

    res.json({
      success: true,
      message: "Package added",
      data: manifest,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding package",
      error: error.message,
    });
  }
};

/* ✅ REMOVE PACKAGE */
const removePackageFromManifest = async (req, res) => {
  try {
    const { manifestNumber } = req.params;
    const { trackingNumber } = req.body;

    const manifest = await Manifest.findOne({ manifestNumber });

    if (!manifest) return res.status(404).json({ success: false, message: "Manifest not found" });

    if (manifest.status !== "Created") {
      return res.status(400).json({
        success: false,
        message: "Cannot remove packages after departure",
      });
    }

    manifest.packages = manifest.packages.filter((t) => t !== trackingNumber);
    manifest.packageCount = manifest.packages.length;
    await manifest.save();

    await Package.updateOne(
      { trackingNumber },
      { $set: { status: "At Warehouse" } }
    );

    res.json({
      success: true,
      message: "Package removed",
      data: manifest,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error removing package",
      error: error.message,
    });
  }
};

/* ✅ DELETE MANIFEST */
const deleteManifest = async (req, res) => {
  try {
    const { manifestNumber } = req.params;

    const manifest = await Manifest.findOne({ manifestNumber });

    if (!manifest) {
      return res.status(404).json({ success: false, message: "Manifest not found" });
    }

    if (manifest.status !== "Created") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete manifest after departure",
      });
    }

    // Reset packages
    await Package.updateMany(
      { trackingNumber: { $in: manifest.packages } },
      { $set: { status: "At Warehouse" } }
    );

    await manifest.deleteOne();

    res.json({
      success: true,
      message: "Manifest deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting manifest",
      error: error.message,
    });
  }
};

/* ✅ EDIT MANIFEST */
const updateManifest = async (req, res) => {
  try {
    const { manifestNumber } = req.params;
    const { origin } = req.body;

    const manifest = await Manifest.findOne({ manifestNumber });

    if (!manifest) return res.status(404).json({ success: false, message: "Manifest not found" });

    if (manifest.status !== "Created") {
      return res.status(400).json({
        success: false,
        message: "Cannot edit after departure",
      });
    }

    manifest.origin = origin || manifest.origin;
    await manifest.save();

    res.json({
      success: true,
      message: "Manifest updated",
      data: manifest,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating manifest",
      error: error.message,
    });
  }
};

const departManifest = async (req, res) => {
  try {
    const { manifestNumber } = req.params;

    const manifest = await Manifest.findOne({ manifestNumber });

    if (!manifest) return res.status(404).json({ success: false, message: "Manifest not found" });

    manifest.status = "In Transit";
    await manifest.save();

    res.json({
      success: true,
      message: "Manifest departed",
      data: manifest,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating manifest",
      error: error.message,
    });
  }
};

const arriveManifest = async (req, res) => {
  try {
    const { manifestNumber } = req.params;

    const manifest = await Manifest.findOne({ manifestNumber });

    if (!manifest) return res.status(404).json({ success: false, message: "Manifest not found" });

    manifest.status = "Arrived Jamaica";
    await manifest.save();

    await Package.updateMany(
      { trackingNumber: { $in: manifest.packages } },
      {
        $set: {
          status: "Cleared Customs",
        },
      }
    );

    res.json({
      success: true,
      message: "Manifest arrived",
      data: manifest,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating manifest",
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
  removePackageFromManifest,
  deleteManifest,
  updateManifest,
  departManifest,
  arriveManifest,
  getManifests,
};