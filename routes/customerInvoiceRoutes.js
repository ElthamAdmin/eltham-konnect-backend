const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();

const {
  getMyInvoiceUploads,
  uploadCustomerInvoice,
} = require("../controllers/customerInvoiceController");

const { protect } = require("../middleware/authMiddleware");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "../uploads/customer-invoices"));
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

router.get("/", protect, getMyInvoiceUploads);
router.post("/", protect, upload.single("invoiceFile"), uploadCustomerInvoice);

module.exports = router;