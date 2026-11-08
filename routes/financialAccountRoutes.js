const express = require("express");

const router = express.Router();

const {
  createAccount,
  getAccounts,
  updateAccount,
} = require("../controllers/financialAccountController");

const {
  protect,
  requireAdmin,
} = require("../middleware/authMiddleware");

router.get("/", protect, getAccounts);

router.post(
  "/",
  protect,
  requireAdmin,
  createAccount
);

router.put(
  "/:accountNumber",
  protect,
  requireAdmin,
  updateAccount
);

module.exports = router;