const express = require("express");
const multer = require("multer");

const {
  getMyInvoiceUploads,
  uploadCustomerInvoice,
  openCustomerInvoice,
} = require("../controllers/customerInvoiceController");

const {
  protectCustomer,
} = require("../middleware/customerAuthMiddleware");

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 3,
  },

  fileFilter: (req, file, cb) => {
    const mimeType = String(file.mimetype || "").toLowerCase();

    if (!allowedTypes.has(mimeType)) {
      return cb(new Error("Only PDF or supported image invoices are allowed."));
    }

    return cb(null, true);
  },
});

const receiveInvoice = (req, res, next) => {
  upload.single("invoiceFile")(req, res, (error) => {
    if (!error) return next();

    return res.status(400).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "The invoice must be 10 MB or smaller."
          : error.message || "The invoice upload could not be processed.",
    });
  });
};

router.get("/", protectCustomer, getMyInvoiceUploads);

router.get(
  "/files/:uploadNumber",
  protectCustomer,
  openCustomerInvoice
);

router.get(
  "/staff/files/:uploadNumber",
  protect,
  requirePermission("packages"),
  openCustomerInvoice
);

router.post(
  "/",
  protectCustomer,
  receiveInvoice,
  uploadCustomerInvoice
);

module.exports = router;