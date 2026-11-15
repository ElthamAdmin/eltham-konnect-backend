const express = require("express");

const router = express.Router();

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const {
  getProfitAndLoss,
} = require("../controllers/profitAndLossController");

router.get(
  "/",
  protect,
  requirePermission("finance"),
  getProfitAndLoss
);

module.exports = router;