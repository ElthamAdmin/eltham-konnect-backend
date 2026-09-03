const express = require("express");

const {
  getActivePortalBanners,
  getPortalBanners,
  createPortalBanner,
  updatePortalBanner,
  archivePortalBanner,
} = require("../controllers/portalBannerController");

const {
  protect,
} = require("../middleware/authMiddleware");

const {
  protectCustomer,
} = require("../middleware/customerAuthMiddleware");

const router = express.Router();

// Customer portal: currently live banners only
router.get(
  "/active",
  protectCustomer,
  getActivePortalBanners
);

// EKOS staff management
router.get(
  "/",
  protect,
  getPortalBanners
);

router.post(
  "/",
  protect,
  createPortalBanner
);

router.put(
  "/:bannerId",
  protect,
  updatePortalBanner
);

router.delete(
  "/:bannerId",
  protect,
  archivePortalBanner
);

module.exports = router;