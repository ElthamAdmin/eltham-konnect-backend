const express = require("express");

const {
  getSettings,
  updateSettings,
  uploadPrimaryLogo,
  uploadInvoiceLogo,
  getCompanyDocuments,
  uploadCompanyDocument,
  getCompanyDocumentAccess,
} = require("../controllers/settingController");

const {
  logoUpload,
  documentUpload,
} = require("../middleware/upload");

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, requirePermission("settings"));

const receiveFile = (uploader, field) => (req, res, next) => {
  uploader.single(field)(req, res, (error) => {
    if (!error) return next();

    return res.status(400).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? field === "logo"
            ? "Logos must be 5 MB or smaller."
            : "PDF documents must be 10 MB or smaller."
          : error.message || "The upload could not be processed.",
    });
  });
};

router.get("/", getSettings);
router.put("/", updateSettings);

router.post(
  "/upload-primary-logo",
  receiveFile(logoUpload, "logo"),
  uploadPrimaryLogo
);

router.post(
  "/upload-invoice-logo",
  receiveFile(logoUpload, "logo"),
  uploadInvoiceLogo
);

router.get("/documents", getCompanyDocuments);

router.get(
  "/documents/:documentNumber/access",
  getCompanyDocumentAccess
);

router.post(
  "/documents/upload",
  receiveFile(documentUpload, "document"),
  uploadCompanyDocument
);

module.exports = router;