const express = require("express");
const {
  submitMarketplaceOrder,
  getMyMarketplaceOrders,
  getAllMarketplaceOrders,
  updateMarketplaceOrderStatus,
} = require("../controllers/marketplaceOrderController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/submit", protect, submitMarketplaceOrder);
router.get("/my-orders", protect, getMyMarketplaceOrders);
router.get("/", protect, getAllMarketplaceOrders);
router.put("/:orderNumber/status", protect, updateMarketplaceOrderStatus);

module.exports = router;