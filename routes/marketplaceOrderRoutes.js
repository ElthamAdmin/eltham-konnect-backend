const express = require("express");
const {
  submitMarketplaceOrder,
  getMyMarketplaceOrders,
  getAllMarketplaceOrders,
  updateMarketplaceOrderStatus,
} = require("../controllers/marketplaceOrderController");

const { protect } = require("../middleware/authMiddleware");

const {
  protectCustomer,
} = require("../middleware/customerAuthMiddleware");

const router = express.Router();

// Customer portal routes
router.post(
  "/submit",
  protectCustomer,
  submitMarketplaceOrder
);

router.get(
  "/my-orders",
  protectCustomer,
  getMyMarketplaceOrders
);

// Staff-only EKOS routes
router.get(
  "/",
  protect,
  getAllMarketplaceOrders
);

router.put(
  "/:orderNumber/status",
  protect,
  updateMarketplaceOrderStatus
);

module.exports = router;