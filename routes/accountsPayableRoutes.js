const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getVendors,
  createVendor,
  getAccountsPayable,
  createAccountsPayable,
  markAccountsPayablePaid,
} = require("../controllers/accountsPayableController");

router.get("/vendors", protect, getVendors);
router.post("/vendors", protect, createVendor);

router.get("/", protect, getAccountsPayable);
router.post("/", protect, createAccountsPayable);
router.put("/:payableNumber/mark-paid", protect, markAccountsPayablePaid);

module.exports = router;