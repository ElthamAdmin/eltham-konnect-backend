const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getCashFlowStatement,
} = require("../controllers/cashFlowController");

router.get(
  "/statement",
  protect,
  getCashFlowStatement
);

module.exports = router;