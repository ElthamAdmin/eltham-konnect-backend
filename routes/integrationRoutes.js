const express = require("express");
const router = express.Router();

const integrationAuth = require("../middleware/integrationAuth");
const { protect, requirePermission } = require("../middleware/authMiddleware");

const {
  receiveFreightPackage,
  syncLtwPackages,
} = require("../controllers/integrationController");

router.post("/freight/packages", integrationAuth, receiveFreightPackage);

router.get(
  "/ltw/sync-packages",
  protect,
  requirePermission("users"),
  syncLtwPackages
);

module.exports = router;