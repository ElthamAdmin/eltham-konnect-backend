const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getVendors,
  createVendor,
  getAccountsPayable,
  createAccountsPayable,
} = require("../controllers/accountsPayableController");

router.get("/vendors", protect, getVendors);
router.post("/vendors", protect, createVendor);

router.get("/", protect, getAccountsPayable);
router.post("/", protect, createAccountsPayable);

module.exports = router;