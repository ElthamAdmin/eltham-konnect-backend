const multer = require("multer");
const path = require("path");
const fs = require("fs");

const receiptsDir = path.join(__dirname, "..", "uploads", "expense-receipts");

if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, receiptsDir);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);
    cb(cb, `expense-${Date.now()}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
  const extension = path.extname(file.originalname).toLowerCase();

  if (!allowedExtensions.includes(extension)) {
    return cb(new Error("Only JPG, JPEG, PNG, WEBP, and PDF files are allowed"));
  }

  cb(null, true);
};

const uploadExpenseReceipt = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

module.exports = uploadExpenseReceipt;