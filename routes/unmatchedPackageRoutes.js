const express = require("express");
const router = express.Router();

const { protect, requirePermission } = require("../middleware/authMiddleware");

const {
  getUnmatchedPackages,
} = require("../controllers/unmatchedPackageController");

router.get("/", protect, requirePermission("users"), getUnmatchedPackages);

module.exports = router;