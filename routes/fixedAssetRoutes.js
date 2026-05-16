const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getFixedAssets,
  createFixedAsset,
  runMonthlyDepreciation,
} = require("../controllers/fixedAssetController");

router.get("/", protect, getFixedAssets);

router.post("/", protect, createFixedAsset);

router.post(
  "/run-depreciation",
  protect,
  runMonthlyDepreciation
);

module.exports = router;