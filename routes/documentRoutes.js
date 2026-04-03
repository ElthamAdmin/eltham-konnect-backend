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

const { protect, requireAnyPermission, requirePermission } = require("../middleware/authMiddleware");

const uploadDir = path.join(__dirname, "../uploads/hr-documents");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    cb(null, uniqueName);
  },
});

const allowedTypes = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, JPG, JPEG, PNG, and WEBP files are allowed"));
    }
  },
});

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
  "/:employeeId/:index",
  protect,
  requirePermission("hr"),
  deleteDocument
);

module.exports = router;