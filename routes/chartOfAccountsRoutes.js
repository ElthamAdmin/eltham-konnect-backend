const express = require("express");

const router = express.Router();

const {
  getAccounts,
  createAccount,
} = require("../controllers/chartOfAccountsController");

const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getAccounts);

router.post("/", protect, createAccount);

module.exports = router;