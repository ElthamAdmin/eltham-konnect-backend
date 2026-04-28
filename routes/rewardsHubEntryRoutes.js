const express = require("express");
const router = express.Router();

const {
  enterRewardsHub,
  getEntriesByHub,
  getCustomerEntries,
} = require("../controllers/rewardsHubEntryController");

router.post("/enter", enterRewardsHub);
router.get("/post/:hubId", getEntriesByHub);
router.get("/customer/:ekonId", getCustomerEntries);

module.exports = router;