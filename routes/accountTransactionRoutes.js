const express = require("express");
const router = express.Router();

const {
  getTransactions,
  createTransaction,
  createTransfer,
} = require("../controllers/accountTransactionController");

router.get("/", getTransactions);
router.post("/", createTransaction);
router.post("/transfer", createTransfer);

module.exports = router;