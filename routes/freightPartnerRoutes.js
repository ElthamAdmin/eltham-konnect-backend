const express = require("express");
const router = express.Router();

const { protect, requirePermission } = require("../middleware/authMiddleware");

const {
  getFreightPartners,
  createFreightPartner,
  updateFreightPartner,
  rotateFreightPartnerApiKey,
} = require("../controllers/freightPartnerController");

router.get("/", protect, requirePermission("freightPartners"), getFreightPartners);
router.post("/", protect, requirePermission("freightPartners"), createFreightPartner);
router.put("/:partnerNumber", protect, requirePermission("freightPartners"), updateFreightPartner);
router.put("/:partnerNumber/rotate-key", protect, requirePermission("freightPartners"), rotateFreightPartnerApiKey);

module.exports = router;