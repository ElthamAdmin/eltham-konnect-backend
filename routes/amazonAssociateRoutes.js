const express = require("express");
const multer = require("multer");

const router = express.Router();

const {
  getActiveAssociateItems,
  getStorefrontDashboard,
  createAssociateItem,
  updateAssociateItem,
  deleteAssociateItem,
} = require("../controllers/amazonAssociateController");

const { protect } = require("../middleware/authMiddleware");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedMimeTypes.includes(file.mimetype)) {
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
router.get("/dashboard", protect, getStorefrontDashboard);
router.get("/active", getActiveAssociateItems);
router.post("/", protect, upload.single("image"), createAssociateItem);
router.put("/:itemNumber", protect, upload.single("image"), updateAssociateItem);
router.delete("/:itemNumber", protect, deleteAssociateItem);

module.exports = router;