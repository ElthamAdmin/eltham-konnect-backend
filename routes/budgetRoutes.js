const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getBudgets,
  createBudget,
} = require("../controllers/budgetController");

router.get("/", protect, getBudgets);

router.post("/", protect, createBudget);

module.exports = router;