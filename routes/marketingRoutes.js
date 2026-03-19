const express = require("express");
const router = express.Router();

const {
  getCampaigns,
  createCampaign,
  updateCampaign,
} = require("../controllers/marketingController");

router.get("/", getCampaigns);
router.post("/", createCampaign);
router.put("/:campaignNumber", updateCampaign);

module.exports = router;