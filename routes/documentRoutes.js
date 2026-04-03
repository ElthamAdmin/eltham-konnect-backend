const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
  uploadDocument,
  getEmployeeDocuments,
  deleteDocument,
} = require("../controllers/documentController");

const { protect, requireAnyPermission } = require("../middleware/authMiddleware");

// 📁 Storage folder
const uploadDir = path.join(__dirname, "../uploads/hr-documents");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 📦 Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    cb(null, uniqueName);
  },
});

// ✅ Allowed file types
const allowedTypes = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
];

// 📦 Upload config
const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, JPG, JPEG, PNG allowed"));
    }
  },
});

// 🔐 Routes
router.post(
  "/upload/:employeeId",
  protect,
  requireAnyPermission(["hr", "documentSelfService"]),
  upload.single("file"),
  uploadDocument
);

router.get(
  "/:employeeId",
  protect,
  requireAnyPermission(["hr", "documentSelfService"]),
  getEmployeeDocuments
);

router.delete(
  "/:employeeId/:docId",
  protect,
  requireAnyPermission(["hr"]),
  deleteDocument
);

module.exports = router;