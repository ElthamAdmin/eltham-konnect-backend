const express = require("express");

const {
  protect,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const {
  getBudgets,
  createBudget,
  updateBudget,
} = require("../controllers/budgetController");

const router = express.Router();

router.use(
  protect,
  requireAnyPermission(["finance"])
);

router.get("/", getBudgets);
router.post("/", createBudget);
router.patch("/:budgetNumber", updateBudget);

module.exports = router;