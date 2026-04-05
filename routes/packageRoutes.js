const express = require("express");
const router = express.Router();

const {
  getPackages,
  getPackageWeightAnalysis,
  createPackage,
  updatePackageStatus,
  bulkUpdatePackageStatus,
} = require("../controllers/packageController");

router.get("/", getPackages);
router.get("/weight-analysis", getPackageWeightAnalysis);
router.post("/", createPackage);
router.put("/bulk-status", bulkUpdatePackageStatus);
router.put("/:trackingNumber/status", updatePackageStatus);

module.exports = router;