const express = require("express");
const router = express.Router();
const {
  createReferralCode,
  applyReferralCode,
  getReferrals,
  getCustomerReferral,
} = require("../controllers/referralController");

router.get("/", getReferrals);
router.get("/customer/:ekonId", getCustomerReferral);
router.post("/create", createReferralCode);
router.post("/apply", applyReferralCode);

module.exports = router;