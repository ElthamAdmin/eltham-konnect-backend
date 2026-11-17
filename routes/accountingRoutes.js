const express = require("express");
const router = express.Router();

const {
  protect,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const {
  getProfitAndLoss,
  getBalanceSheet,
  closeYearToRetainedEarnings,
} = require("../controllers/accountingController");

const {
  closeAccountingPeriod,
} = require("../controllers/accountingPeriodController");

const requireClosingAdmin = (req, res, next) => {
  if (req.user?.role !== "Admin") {
    return res.status(403).json({
      success: false,
      message: "Only an Admin can change closing controls.",
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

router.get("/profit-loss", getProfitAndLoss);
router.get("/balance-sheet", getBalanceSheet);

router.post(
  "/close-period",
  requireClosingAdmin,
  closeAccountingPeriod
);

router.post(
  "/close-year",
  requireClosingAdmin,
  closeYearToRetainedEarnings
);

module.exports = router;