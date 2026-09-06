const express = require("express");
const router = express.Router();

const {
  signupCustomer,
  loginCustomer,
  getCustomerMe,
  updateCustomerMe,
  changeCustomerPassword,
  acceptPolicies,
  setupCustomerPassword,
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

router.put(
  "/me",
  protectCustomer,
  updateCustomerMe
);

router.put(
  "/change-password",
  protectCustomer,
  changeCustomerPassword
);

router.post(
  "/accept-policies",
  protectCustomer,
  acceptPolicies
);

module.exports = router;