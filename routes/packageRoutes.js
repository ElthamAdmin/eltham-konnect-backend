const express = require("express");
const router = express.Router();

const {
  getPackages,
  createPackage,
  updatePackageStatus,
} = require("../controllers/packageController");

router.get("/", getPackages);
router.post("/", createPackage);
router.put("/:trackingNumber/status", updatePackageStatus);

module.exports = router;