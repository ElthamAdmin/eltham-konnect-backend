const express = require("express");
const multer = require("multer");

const router = express.Router();

const {
  getPreAlerts,
  createPreAlert,
  openPreAlertInvoice,
} = require("../controllers/preAlertController");

const { protect } = require("../middleware/authMiddleware");

const {
  protectCustomer,
} = require("../middleware/customerAuthMiddleware");

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 6,
    fieldSize: 32 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const mimeType = String(file.mimetype || "").toLowerCase();

    if (!allowedTypes.has(mimeType)) {
      return cb(
        new Error("Only PDF, JPG, JPEG, PNG and WEBP invoices are allowed.")
      );
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

router.get("/my", protectCustomer, getPreAlerts);

router.get(
  "/my/:preAlertNumber/invoice",
  protectCustomer,
  openPreAlertInvoice
);

router.post(
  "/",
  protectCustomer,
  receiveInvoice,
  createPreAlert
);

router.get(
  "/staff/:preAlertNumber/invoice",
  protect,
  openPreAlertInvoice
);

router.get("/", protect, getPreAlerts);

module.exports = router;