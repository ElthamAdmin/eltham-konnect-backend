const express = require("express");

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const {
  getVendors,
  createVendor,
  getAccountsPayable,
  createAccountsPayable,
  markAccountsPayablePaid,
} = require("../controllers/accountsPayableController");

const router = express.Router();

router.use(protect, requirePermission("finance"));

router.get("/vendors", getVendors);
router.post("/vendors", createVendor);

router.get("/", getAccountsPayable);
router.post("/", createAccountsPayable);

router.put("/:payableNumber/payments", markAccountsPayablePaid);
router.put("/:payableNumber/mark-paid", markAccountsPayablePaid);

module.exports = router;