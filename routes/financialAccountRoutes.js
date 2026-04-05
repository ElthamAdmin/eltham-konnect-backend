const express = require("express");

const router = express.Router();

const {
  createAccount,
  getAccounts,
  updateAccount,
} = require("../controllers/financialAccountController");


router.post("/", createAccount);
router.get("/", getAccounts);
router.put("/:accountNumber", updateAccount);


module.exports = router;