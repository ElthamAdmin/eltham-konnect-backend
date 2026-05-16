const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getProfitAndLoss,
} = require("../controllers/accountingController");

router.get("/profit-loss", protect, getProfitAndLoss);

module.exports = router;