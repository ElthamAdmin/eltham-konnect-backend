const express = require("express");
const router = express.Router();

const {
  getPackages,
  createPackage,
  updatePackageStatus,
  bulkUpdatePackageStatus,
} = require("../controllers/packageController");

router.get("/", getPackages);
router.post("/", createPackage);
router.put("/bulk-status", bulkUpdatePackageStatus);
router.put("/:trackingNumber/status", updatePackageStatus);

module.exports = router;