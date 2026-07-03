const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getBalanceSheet,
} = require("../controllers/balanceSheetController");

router.get("/", protect, getBalanceSheet);

module.exports = router;