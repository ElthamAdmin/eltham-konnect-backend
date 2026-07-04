const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getFiscalYears,
  createFiscalYear,
  validateFiscalYear,
  closeFiscalYear,
  lockFiscalYear,
  createNextFiscalYear,
  executeYearEndClose,
  generateOpeningBalances,
} = require("../controllers/fiscalYearController");

router.get("/", protect, getFiscalYears);

router.post("/", protect, createFiscalYear);

router.get("/:fiscalYear/validate", protect, validateFiscalYear);

router.put("/:fiscalYear/close", protect, closeFiscalYear);

router.put("/:fiscalYear/lock", protect, lockFiscalYear);

router.post("/:fiscalYear/create-next", protect, createNextFiscalYear);

router.post("/:fiscalYear/year-end-close", protect, executeYearEndClose);

router.post("/:fiscalYear/opening-balances", protect, generateOpeningBalances);

module.exports = router;