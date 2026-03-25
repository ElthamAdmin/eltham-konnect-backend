const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const {
  getPreAlerts,
  createPreAlert,
} = require("../controllers/preAlertController");

const { protect } = require("../middleware/authMiddleware");

const preAlertsUploadDir = path.join(__dirname, "..", "uploads", "prealerts");

if (!fs.existsSync(preAlertsUploadDir)) {
  fs.mkdirSync(preAlertsUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, preAlertsUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const safeTracking = String(req.body.trackingNumber || "prealert")
      .replace(/[^a-zA-Z0-9-_]/g, "")
      .slice(0, 40);

    cb(null, `prealert-${safeTracking}-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    return cb(null, true);
  }

  return cb(new Error("Only PDF, JPG, JPEG, PNG, and WEBP files are allowed"));
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

router.get("/", protect, getPreAlerts);
router.post("/", protect, upload.single("invoiceFile"), createPreAlert);

module.exports = router;