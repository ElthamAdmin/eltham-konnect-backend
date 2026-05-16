const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getFiscalYears,
  createFiscalYear,
  closeFiscalYear,
  lockFiscalYear,
} = require("../controllers/fiscalYearController");

router.get("/", protect, getFiscalYears);

router.post("/", protect, createFiscalYear);

router.put(
  "/:fiscalYear/close",
  protect,
  closeFiscalYear
);

router.put(
  "/:fiscalYear/lock",
  protect,
  lockFiscalYear
);

module.exports = router;