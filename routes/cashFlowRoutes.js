const express = require("express");

const router = express.Router();

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const {
  getCashFlowStatement,
} = require("../controllers/cashFlowController");

router.get(
  "/statement",
  protect,
  requirePermission("finance"),
  getCashFlowStatement
);

module.exports = router;