const express = require("express");
const router = express.Router();

const integrationAuth = require("../middleware/integrationAuth");
const { protect, requirePermission } = require("../middleware/authMiddleware");

const {
  receiveFreightPackage,
  syncLtwPackages,
  getKpCustomers,
  receiveKpPackages,
  updateKpPackage,
  deleteKpPackage,
  updateKpManifest,
} = require("../controllers/integrationController");

router.post("/freight/packages", integrationAuth, receiveFreightPackage);

router.get("/kp/customers", integrationAuth, getKpCustomers);
router.post("/kp/packages", integrationAuth, receiveKpPackages);
router.post(
  "/kp/packages/update",
  integrationAuth,
  updateKpPackage
);

router.post(
  "/kp/packages/delete",
  integrationAuth,
  deleteKpPackage
);

router.post(
  "/kp/manifests/update",
  integrationAuth,
  updateKpManifest
);

router.get(
  "/ltw/sync-packages",
  protect,
  requirePermission("integrations"),
  syncLtwPackages
);

module.exports = router;