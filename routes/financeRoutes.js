const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  getExpenses,
  createExpense,
} = require("../controllers/expenseController");

const {
  getPayroll,
  getMyPayroll,
  createPayroll,
} = require("../controllers/payrollController");

const router = express.Router();

const {
  getFinanceSummary,
  getFinancialReports,
  getMonthlyIncomeVsExpenses,
  rebuildFinanceBalances,
} = require("../controllers/reportController");

const { protect } = require("../middleware/authMiddleware");

const expenseReceiptsDir = path.join(__dirname, "..", "uploads", "expense-receipts");

if (!fs.existsSync(expenseReceiptsDir)) {
  fs.mkdirSync(expenseReceiptsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, expenseReceiptsDir);
  },
  filename: (req, file, cb) => {
    const safeOriginalName = file.originalname.replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${safeOriginalName}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    return cb(new Error("Only JPG, JPEG, PNG, WEBP, and PDF files are allowed"));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

router.get("/summary", protect, getFinanceSummary);
router.get("/reports", protect, getFinancialReports);
router.get("/monthly-chart", protect, getMonthlyIncomeVsExpenses);
router.post("/rebuild-balances", protect, rebuildFinanceBalances);

router.get("/expenses", protect, getExpenses);
router.post("/expenses", protect, upload.single("receipt"), createExpense);

router.get("/payroll", protect, getPayroll);
router.get("/payroll/my-records", protect, getMyPayroll);
router.post("/payroll", protect, createPayroll);

module.exports = router;