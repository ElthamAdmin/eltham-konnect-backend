const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  getExpenses,
  createExpense,
} = require("../controllers/expenseController");

const {
  getExpenseCategories,
  getExpenseCategoryAccounts,
  createExpenseCategory,
  updateExpenseCategory,
} = require("../controllers/expenseCategoryController");

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
  getOperationalDashboard,
  getFinanceSummary,
  getFinancialReports,
  getMonthlyIncomeVsExpenses,
  rebuildFinanceBalances,
} = require("../controllers/reportController");

const { protect } = require("../middleware/authMiddleware");

const {
  requireFinanceAdmin,
} = require("../middleware/financeAdminMiddleware");

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

router.get(
  "/operational-dashboard",
  protect,
  getOperationalDashboard
);
router.get("/summary", protect, getFinanceSummary);
router.get("/reports", protect, getFinancialReports);
router.get("/monthly-chart", protect, getMonthlyIncomeVsExpenses);
router.post("/rebuild-balances", protect, rebuildFinanceBalances);
router.get("/audit/trial-balance", protect, auditTrialBalance);

router.post(
  "/financial-position/preview",
  protect,
  requireFinanceAdmin,
  previewFinancialPosition
);

router.get(
  "/adjustment-batches",
  protect,
  requireFinanceAdmin,
  getAdjustmentBatches
);

router.post(
  "/adjustment-batches",
  protect,
  requireFinanceAdmin,
  createAdjustmentBatch
);

router.post(
  "/adjustment-batches/:batchNumber/post",
  protect,
  requireFinanceAdmin,
  postAdjustmentBatch
);

router.delete(
  "/adjustment-batches/:batchNumber",
  protect,
  requireFinanceAdmin,
  deleteDraftAdjustmentBatch
);
router.get(
  "/expense-categories/posting-accounts",
  protect,
  getExpenseCategoryAccounts
);

router.get(
  "/expense-categories",
  protect,
  getExpenseCategories
);

router.post(
  "/expense-categories",
  protect,
  createExpenseCategory
);

router.put(
  "/expense-categories/:categoryId",
  protect,
  updateExpenseCategory
);
router.get("/expenses", protect, getExpenses);
router.post("/expenses", protect, upload.single("receipt"), createExpense);

module.exports = router;