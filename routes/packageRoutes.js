const express = require("express");
const router = express.Router();

const {
  getPackages,
  getMyPackages,
  getPackageWeightAnalysis,
  createPackage,
  updatePackageStatus,
  bulkUpdatePackageStatus,
  deletePackage,
} = require("../controllers/packageController");

const {
  protectCustomer,
} = require("../middleware/customerAuthMiddleware");

router.get("/", getPackages);
router.get(
  "/my",
  protectCustomer,
  getMyPackages
);
router.get("/weight-analysis", getPackageWeightAnalysis);
router.post("/", createPackage);
router.put("/bulk-status", bulkUpdatePackageStatus);
router.put("/:trackingNumber/status", updatePackageStatus);
router.delete("/:trackingNumber", deletePackage);

module.exports = router;