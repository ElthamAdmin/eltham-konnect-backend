const express = require("express");
const {
  getMyCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} = require("../controllers/marketplaceCartController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getMyCart);
router.post("/add", protect, addToCart);
router.put("/:itemNumber", protect, updateCartItem);
router.delete("/:itemNumber", protect, removeCartItem);
router.delete("/", protect, clearCart);

module.exports = router;