const express = require("express");

const router = express.Router();

const {
  protect,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const {
  getAccountingPeriods,
  getCurrentAccountingPeriod,
  createAccountingPeriod,
  validateAccountingPeriod,
  getCloseChecklist,
  closeAccountingManagementPeriod,
  lockAccountingPeriod,
  reopenAccountingPeriod,
} = require("../controllers/accountingPeriodManagementController");

const requirePeriodAdmin = (req, res, next) => {
  if (req.user?.role !== "Admin") {
    return res.status(403).json({
      success: false,
      message: "Only an Admin can change accounting period controls.",
    });
  }

  return next();
};

router.use(
  protect,
  requireAnyPermission(["finance"]),
  (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  }
);

router.get("/", getAccountingPeriods);
router.get("/current", getCurrentAccountingPeriod);
router.get("/:periodNumber/validate", validateAccountingPeriod);
router.get("/:periodNumber/checklist", getCloseChecklist);

router.post("/", requirePeriodAdmin, createAccountingPeriod);
router.put("/:periodNumber/close", requirePeriodAdmin, closeAccountingManagementPeriod);
router.put("/:periodNumber/lock", requirePeriodAdmin, lockAccountingPeriod);
router.put("/:periodNumber/reopen", requirePeriodAdmin, reopenAccountingPeriod);

module.exports = router;