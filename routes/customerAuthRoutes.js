const express = require("express");
const router = express.Router();

const {
  loginCustomer,
  getCustomerMe,
  acceptPolicies,
} = require("../controllers/customerAuthController");

const { protect } = require("../middleware/authMiddleware");

router.post("/login", loginCustomer);
router.get("/me", protect, getCustomerMe);
router.post("/accept-policies", protect, acceptPolicies);

module.exports = router;