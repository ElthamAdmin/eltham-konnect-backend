const express = require("express");
const router = express.Router();

const {
  getTransactions,
  createTransaction,
  createTransfer,
} = require("../controllers/accountTransactionController");

const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getTransactions);
router.post("/", protect, createTransaction);
router.post("/transfer", protect, createTransfer);

module.exports = router;