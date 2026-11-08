const express = require("express");
const multer = require("multer");

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const {
  getFreightInvoices,
  createFreightInvoice,
  recordFreightPayment,
  openFreightAttachment,
} = require("../controllers/freightInvoiceController");

const {
  previewFreightExpenseLink,
  linkFreightExpense,
} = require("../controllers/freightExpenseLinkController");


const router = express.Router();

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
    fields: 1,
    fieldSize: 512 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!allowedTypes.has(String(file.mimetype || "").toLowerCase())) {
      return cb(new Error("Only PDF, JPG, PNG and WEBP files are allowed."));
    }

    cb(null, true);
  },
});

const receiveAttachment = (req, res, next) => {
  upload.single("attachment")(req, res, (error) => {
    if (!error) return next();

    return res.status(400).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "The attachment must be 10 MB or smaller."
          : error.message || "Could not process the attachment.",
    });
  });
};

router.use(protect, requirePermission("finance"));

router.get("/", getFreightInvoices);
router.post("/", receiveAttachment, createFreightInvoice);
router.post(
  "/:freightInvoiceNumber/existing-expense/preview",
  previewFreightExpenseLink
);

router.post(
  "/:freightInvoiceNumber/existing-expense/link",
  linkFreightExpense
);

router.post(
  "/:freightInvoiceNumber/payments",
  receiveAttachment,
  recordFreightPayment
);

router.get(
  "/:freightInvoiceNumber/documents/:documentType",
  openFreightAttachment
);

router.get(
  "/:freightInvoiceNumber/documents/payment/:paymentId",
  openFreightAttachment
);

module.exports = router;