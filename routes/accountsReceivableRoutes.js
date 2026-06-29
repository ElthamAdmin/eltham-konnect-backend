const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getARAging,
  getCustomerStatement,
  getARReconciliation,
} = require("../controllers/accountsReceivableController");

router.get("/aging", protect, getARAging);
router.get("/reconcile", protect, getARReconciliation);
router.get("/customers/:customerEkonId/statement", protect, getCustomerStatement);

module.exports = router;