const express = require("express");
const router = express.Router();

const {
  getShippingRates,
  getRateByWeight,
} = require("../controllers/shippingRateController");

router.get("/", getShippingRates);
router.get("/:weight", getRateByWeight);

module.exports = router;