const express = require("express");
const router = express.Router();
const {
  createReferralCode,
  applyReferralCode,
} = require("../controllers/referralController");

router.post("/create", createReferralCode);
router.post("/apply", applyReferralCode);

module.exports = router;