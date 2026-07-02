const express = require("express");

const router = express.Router();

const {
  getAccounts,
  createAccount,
  getChartHealth,
  getAccountTree,
} = require("../controllers/chartOfAccountsController");

const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getAccounts);
router.get("/health", protect, getChartHealth);
router.get("/tree", protect, getAccountTree);

router.post("/", protect, createAccount);

module.exports = router;