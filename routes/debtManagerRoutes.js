const express = require("express");
const router = express.Router();

const { protect, requirePermission } = require("../middleware/authMiddleware");

const {
  getDebtManagerData,
  createDebtAccount,
  updateDebtAccount,
  recordDebtPayment,
} = require("../controllers/debtManagerController");

router.get("/", protect, requirePermission("finance"), getDebtManagerData);
router.post("/", protect, requirePermission("finance"), createDebtAccount);
router.put("/:debtNumber", protect, requirePermission("finance"), updateDebtAccount);
router.post("/:debtNumber/payments", protect, requirePermission("finance"), recordDebtPayment);

module.exports = router;