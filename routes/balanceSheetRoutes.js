const express = require("express");

const router = express.Router();

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const {
  getBalanceSheet,
} = require("../controllers/balanceSheetController");

router.get(
  "/",
  protect,
  requirePermission("finance"),
  getBalanceSheet
);

module.exports = router;