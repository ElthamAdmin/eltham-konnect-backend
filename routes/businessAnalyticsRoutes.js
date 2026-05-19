const express = require("express");

const router = express.Router();

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const {
  getBusinessAnalytics,
} = require("../controllers/businessAnalyticsController");

router.get(
  "/",
  protect,
  requirePermission("finance"),
  getBusinessAnalytics
);

module.exports = router;