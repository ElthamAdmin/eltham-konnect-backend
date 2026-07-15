const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
    getExpenseCategories,
  getExpenses,
  createExpense,
} = require("../controllers/expenseController");

const {
  auditTrialBalance,
} = require("../controllers/accountingAuditController");

const {
  previewFinancialPosition,
  createAdjustmentBatch,
  postAdjustmentBatch,
  getAdjustmentBatches,
    deleteDraftAdjustmentBatch,

} = require("../controllers/financialAdjustmentController");

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
router.get("/audit/trial-balance", protect, auditTrialBalance);

router.post("/financial-position/preview", protect, previewFinancialPosition);
router.get("/adjustment-batches", protect, getAdjustmentBatches);
router.post("/adjustment-batches", protect, createAdjustmentBatch);
router.post(
  "/adjustment-batches/:batchNumber/post",
  protect,
  postAdjustmentBatch
);

router.delete(
  "/adjustment-batches/:batchNumber",
  protect,
  deleteDraftAdjustmentBatch
);
router.get("/expense-categories", protect, getExpenseCategories);
router.get("/expenses", protect, getExpenses);
router.post("/expenses", protect, upload.single("receipt"), createExpense);

module.exports = router;