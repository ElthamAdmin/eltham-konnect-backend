const express = require("express");
const router = express.Router();

const {
  getAnalytics,
} = require("../controllers/rewardsHubAnalyticsController");

router.get("/", getAnalytics);

module.exports = router;