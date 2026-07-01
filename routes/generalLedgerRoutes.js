const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getGeneralLedger,
  getGeneralLedgerHealth,
} = require("../controllers/generalLedgerController");

router.get("/", protect, getGeneralLedger);
router.get("/health", protect, getGeneralLedgerHealth);

module.exports = router;