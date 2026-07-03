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
} = require("../controllers/fiscalYearController");

router.get("/", protect, getFiscalYears);

router.post("/", protect, createFiscalYear);

router.get("/:fiscalYear/validate", protect, validateFiscalYear);

router.put("/:fiscalYear/close", protect, closeFiscalYear);

router.put("/:fiscalYear/lock", protect, lockFiscalYear);

router.post("/:fiscalYear/create-next", protect, createNextFiscalYear);

module.exports = router;