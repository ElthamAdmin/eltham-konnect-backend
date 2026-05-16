const express = require("express");
const router = express.Router();

const integrationAuth = require("../middleware/integrationAuth");
const { protect, requirePermission } = require("../middleware/authMiddleware");

const {
  receiveFreightPackage,
  syncLtwPackages,
  getKpCustomers,
  receiveKpPackages,
} = require("../controllers/integrationController");

router.post("/freight/packages", integrationAuth, receiveFreightPackage);

router.get("/kp/customers", getKpCustomers);
router.post("/kp/packages", receiveKpPackages);

router.get(
  "/ltw/sync-packages",
  protect,
  requirePermission("integrations"),
  syncLtwPackages
);

module.exports = router;