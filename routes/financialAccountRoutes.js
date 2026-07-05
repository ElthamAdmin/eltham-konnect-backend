const express = require("express");

const router = express.Router();

const {
  createAccount,
  getAccounts,
  updateAccount,
} = require("../controllers/financialAccountController");

const { protect } = require("../middleware/authMiddleware");


router.post("/", protect, createAccount);
router.get("/", protect, getAccounts);
router.put("/:accountNumber", protect, updateAccount);


module.exports = router;