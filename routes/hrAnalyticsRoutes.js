const express = require("express");
const router = express.Router();

const { getHRAnalyticsDashboard } = require("../controllers/hrAnalyticsController");
const {
  getAttendanceAndLatenessReport,
} = require(
  "../controllers/hrAttendanceReportingController"
);
const { protect, requirePermission } = require("../middleware/authMiddleware");

router.get(
  "/dashboard",
  protect,
  requirePermission("hr"),
  getHRAnalyticsDashboard
);

router.get(
  "/attendance",
  protect,
  requirePermission("hr"),
  getAttendanceAndLatenessReport
);

module.exports = router;

