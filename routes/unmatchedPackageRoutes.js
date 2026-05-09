const express = require("express");
const router = express.Router();

const { protect, requirePermission } = require("../middleware/authMiddleware");

const {
  getUnmatchedPackages,
  resolveUnmatchedPackage,
} = require("../controllers/unmatchedPackageController");

router.get("/", protect, requirePermission("users"), getUnmatchedPackages);
router.put("/:unmatchedNumber/resolve", protect, requirePermission("users"), resolveUnmatchedPackage);

module.exports = router;