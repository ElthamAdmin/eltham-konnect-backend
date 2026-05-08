const express = require("express");
const router = express.Router();

const { protect, requirePermission } = require("../middleware/authMiddleware");

const {
  getFreightPartners,
  createFreightPartner,
  updateFreightPartner,
  rotateFreightPartnerApiKey,
} = require("../controllers/freightPartnerController");

router.get("/", protect, requirePermission("users"), getFreightPartners);
router.post("/", protect, requirePermission("users"), createFreightPartner);
router.put("/:partnerNumber", protect, requirePermission("users"), updateFreightPartner);
router.put("/:partnerNumber/rotate-key", protect, requirePermission("users"), rotateFreightPartnerApiKey);

module.exports = router;