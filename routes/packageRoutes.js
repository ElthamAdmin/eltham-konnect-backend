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
  updatePackageDetails,
} = require("../controllers/packageEditController");

const {
  getPackageStoragePreview,
} = require("../controllers/storagePreviewController");

const {
  protectCustomer,
} = require("../middleware/customerAuthMiddleware");

const {
  protect,
  requirePermission,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const canReadPackages = requireAnyPermission([
  "packages",
  "warehouse",
  "dashboard",
  "invoices",
  "finance",
  "manifests",
  "pos",
  "analytics",
]);

const canManagePackageStatus = requireAnyPermission([
  "packages",
  "warehouse",
]);

/*
 * Customer access uses its own authentication.
 * Keep this route before the staff routes.
 */
router.get(
  "/my",
  protectCustomer,
  getMyPackages
);

router.get(
  "/",
  protect,
  canReadPackages,
  getPackages
);

router.get(
  "/weight-analysis",
  protect,
  canReadPackages,
  getPackageWeightAnalysis
);

router.post(
  "/",
  protect,
  requirePermission("packages"),
  createPackage
);

router.put(
  "/bulk-status",
  protect,
  canManagePackageStatus,
  bulkUpdatePackageStatus
);

router.get(
  "/:packageId/storage-preview",
  protect,
  canReadPackages,
  getPackageStoragePreview
);

router.put(
  "/:packageId/details",
  protect,
  requirePermission("packages"),
  updatePackageDetails
);

router.put(
  "/:trackingNumber/status",
  protect,
  canManagePackageStatus,
  updatePackageStatus
);

router.delete(
  "/:trackingNumber",
  protect,
  requirePermission("packages"),
  deletePackage
);

module.exports = router;