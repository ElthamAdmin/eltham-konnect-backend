const express = require("express");
const router = express.Router();

const {
  getLeaderboard,
} = require("../controllers/rewardsHubLeaderboardController");

router.get("/", getLeaderboard);

module.exports = router;