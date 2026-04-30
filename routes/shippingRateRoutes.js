const express = require("express");
const router = express.Router();

const {
  getShippingRates,
  getRateByWeight,
  updateShippingRate,
} = require("../controllers/shippingRateController");

// Get all rates
router.get("/", getShippingRates);

// Get single rate
router.get("/:weight", getRateByWeight);

// Update/Create rate
router.put("/:weight", updateShippingRate);

module.exports = router;