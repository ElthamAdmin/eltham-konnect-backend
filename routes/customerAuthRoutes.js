const express = require("express");
const router = express.Router();

const {
  signupCustomer,
  loginCustomer,
  getCustomerMe,
  acceptPolicies,
} = require("../controllers/customerAuthController");

const { protect } = require("../middleware/authMiddleware");

router.post("/signup", signupCustomer);
router.post("/login", loginCustomer);
router.get("/me", protect, getCustomerMe);
router.post("/accept-policies", protect, acceptPolicies);

module.exports = router;