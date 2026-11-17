const express = require("express");
const router = express.Router();

const {
  protect,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const controller = require("../controllers/fiscalYearController");

const requireFiscalAdmin = (req, res, next) => {
  if (req.user?.role !== "Admin") {
    return res.status(403).json({
      success: false,
      message: "Only an Admin can change fiscal year controls.",
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

router.get("/", controller.getFiscalYears);
router.get("/:fiscalYear/validate", controller.validateFiscalYear);

router.post("/", requireFiscalAdmin, controller.createFiscalYear);
router.put("/:fiscalYear/close", requireFiscalAdmin, controller.closeFiscalYear);
router.put("/:fiscalYear/lock", requireFiscalAdmin, controller.lockFiscalYear);
router.post(
  "/:fiscalYear/create-next",
  requireFiscalAdmin,
  controller.createNextFiscalYear
);

// Compatibility endpoints: no duplicate opening journals or automatic switching.
router.post(
  "/:fiscalYear/year-end-close",
  requireFiscalAdmin,
  controller.executeYearEndClose
);
router.post(
  "/:fiscalYear/opening-balances",
  requireFiscalAdmin,
  controller.generateOpeningBalances
);
router.post(
  "/:fiscalYear/run-enterprise-year-end",
  requireFiscalAdmin,
  controller.runEnterpriseYearEnd
);

module.exports = router;