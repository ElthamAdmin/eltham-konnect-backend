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

/*
|--------------------------------------------------------------------------
| Vendor Management
|--------------------------------------------------------------------------
*/

router.get("/vendors", protect, getVendors);
router.post("/vendors", protect, createVendor);

/*
|--------------------------------------------------------------------------
| Accounts Payable Bills
|--------------------------------------------------------------------------
*/

router.get("/", protect, getAccountsPayable);

router.post("/", protect, createAccountsPayable);

/*
|--------------------------------------------------------------------------
| Accounts Payable Payments
|--------------------------------------------------------------------------
|
| This endpoint supports:
| • Full payment
| • Partial payment
| • Multiple payments against one bill
| • Journal Entry posting
| • General Ledger posting
| • Payment history
| • Vendor balance update
|
*/

router.put(
  "/:payableNumber/payments",
  protect,
  markAccountsPayablePaid
);

/*
|--------------------------------------------------------------------------
| Backward Compatibility
|--------------------------------------------------------------------------
|
| Existing frontend code using /mark-paid
| will continue to work during the transition.
|
*/

router.put(
  "/:payableNumber/mark-paid",
  protect,
  markAccountsPayablePaid
);

module.exports = router;