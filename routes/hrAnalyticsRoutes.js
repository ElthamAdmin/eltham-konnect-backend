const express = require("express");
const router = express.Router();

const { getHRAnalyticsDashboard } = require("../controllers/hrAnalyticsController");
const { protect, requirePermission } = require("../middleware/authMiddleware");

router.get("/dashboard", protect, requirePermission("hr"), getHRAnalyticsDashboard);

module.exports = router;