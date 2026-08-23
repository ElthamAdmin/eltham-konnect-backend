const express = require("express");
const router = express.Router();

const {
  signupCustomer,
  loginCustomer,
  getCustomerMe,
  acceptPolicies,
  setupCustomerPassword, // ✅ ADD THIS
} = require("../controllers/customerAuthController");

const {
  protectCustomer,
} = require("../middleware/customerAuthMiddleware");

// ==========================
// AUTH ROUTES
// ==========================
router.post("/signup", signupCustomer);
router.post("/login", loginCustomer);

// ==========================
// FIRST-TIME PASSWORD SETUP
// ==========================
router.post("/setup-password", setupCustomerPassword);

// ==========================
// PROTECTED ROUTES
// ==========================
router.get(
  "/me",
  protectCustomer,
  getCustomerMe
);

router.post(
  "/accept-policies",
  protectCustomer,
  acceptPolicies
);

module.exports = router;