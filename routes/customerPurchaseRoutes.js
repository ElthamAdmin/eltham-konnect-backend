const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getCustomerPurchases,
  getCustomerPurchaseByNumber,
  getCustomerPurchaseDashboard,
  createCustomerPurchase,
  updateUnpostedCustomerPurchase,
  recordCustomerPurchaseTracking,
  linkCustomerPurchasePackage,
  receiveCustomerPurchase,
  prepareCustomerPurchaseRecovery,
  refundCustomerPurchaseRecord,
} = require("../controllers/customerPurchaseController");

/*
|--------------------------------------------------------------------------
| Customer Purchase Dashboard
|--------------------------------------------------------------------------
*/

router.get(
  "/dashboard",
  protect,
  getCustomerPurchaseDashboard
);

/*
|--------------------------------------------------------------------------
| Customer Purchase Register
|--------------------------------------------------------------------------
*/

router.get("/", protect, getCustomerPurchases);

router.get(
  "/:purchaseNumber",
  protect,
  getCustomerPurchaseByNumber
);

router.post("/", protect, createCustomerPurchase);

/*
|--------------------------------------------------------------------------
| Customer Purchase Operations
|--------------------------------------------------------------------------
*/

router.put(
  "/:purchaseNumber",
  protect,
  updateUnpostedCustomerPurchase
);

router.patch(
  "/:purchaseNumber/tracking",
  protect,
  recordCustomerPurchaseTracking
);

router.patch(
  "/:purchaseNumber/link-package",
  protect,
  linkCustomerPurchasePackage
);

router.patch(
  "/:purchaseNumber/receive",
  protect,
  receiveCustomerPurchase
);

router.patch(
  "/:purchaseNumber/prepare-recovery",
  protect,
  prepareCustomerPurchaseRecovery
);

router.patch(
  "/:purchaseNumber/refund",
  protect,
  refundCustomerPurchaseRecord
);

module.exports = router;