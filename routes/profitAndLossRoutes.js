const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getProfitAndLoss,
} = require("../controllers/profitAndLossController");

router.get("/", protect, getProfitAndLoss);

module.exports = router;