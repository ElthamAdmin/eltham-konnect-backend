const express = require("express");
const {
  createMarketplaceProduct,
  getMarketplaceProducts,
  updateMarketplaceProduct,
  getLowStockProducts,
} = require("../controllers/marketplaceProductController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createMarketplaceProduct);
router.get("/", protect, getMarketplaceProducts);
router.get("/low-stock", protect, getLowStockProducts);
router.put("/:itemNumber", protect, updateMarketplaceProduct);

module.exports = router;