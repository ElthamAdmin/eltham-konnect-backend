const express = require("express");
const router = express.Router();

const {
  signupCustomer,
  loginCustomer,
  getCustomerMe,
  acceptPolicies,
  setupCustomerPassword, // ✅ ADD THIS
} = require("../controllers/customerAuthController");

const { protect } = require("../middleware/authMiddleware");

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
router.get("/me", protect, getCustomerMe);
router.post("/accept-policies", protect, acceptPolicies);

module.exports = router;