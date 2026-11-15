const express = require("express");

const router = express.Router();

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const {
  getFixedAssets,
  createFixedAsset,
  runMonthlyDepreciation,
} = require("../controllers/fixedAssetController");

router.use(
  protect,
  requirePermission("finance")
);

router.get("/", getFixedAssets);
router.post("/", createFixedAsset);

router.post(
  "/run-depreciation",
  runMonthlyDepreciation
);

module.exports = router;