const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const router = express.Router();

const {
  getAllAssociateItems,
  getActiveAssociateItems,
  createAssociateItem,
  updateAssociateItem,
  deleteAssociateItem,
} = require("../controllers/amazonAssociateController");

const { protect } = require("../middleware/authMiddleware");

const uploadDir = path.join(__dirname, "..", "uploads", "amazon-associate");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    return cb(new Error("Only JPG, JPEG, PNG, and WEBP images are allowed"));
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

router.get("/", protect, getAllAssociateItems);
router.get("/active", getActiveAssociateItems);
router.post("/", protect, upload.single("image"), createAssociateItem);
router.put("/:itemNumber", protect, upload.single("image"), updateAssociateItem);
router.delete("/:itemNumber", protect, deleteAssociateItem);

module.exports = router;