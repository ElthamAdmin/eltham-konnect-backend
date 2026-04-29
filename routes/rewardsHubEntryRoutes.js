const express = require("express");
const router = express.Router();

const {
  enterRewardsHub,
  getEntriesByHub,
  getCustomerEntries,
  pickWinner,
} = require("../controllers/rewardsHubEntryController");

router.post("/enter", enterRewardsHub);
router.get("/post/:hubId", getEntriesByHub);
router.get("/customer/:ekonId", getCustomerEntries);

// ⭐ NEW
router.post("/pick-winner/:hubId", pickWinner);
router.post("/reward-winner/:hubId", rewardWinner);

module.exports = router;