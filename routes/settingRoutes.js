const express = require("express");
const {
  uploadSeasonalIcon,
  scheduleSeasonalCampaign,
  getPublicSeasonalBranding,
} = require("../controllers/seasonalBrandingController");

const {
  uploadLoginWallpaper,
  saveLoginAppearance,
  getPublicLoginAppearance,
} = require("../controllers/loginAppearanceController");

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
  wallpaperUpload,
} = require("../middleware/upload");

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

const router = express.Router();
const {
  setStorageChargingStatus,
} = require("../controllers/storageSettingsController");

router.get(
  "/login-appearance/public/:portal",
  getPublicLoginAppearance
);

router.get(
  "/seasonal-branding/public",
  getPublicSeasonalBranding
);

router.use(protect, requirePermission("settings"));

const receiveFile = (uploader, field) => (req, res, next) => {
  uploader.single(field)(req, res, (error) => {
    if (!error) return next();

    return res.status(400).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
                    ? field === "document"
            ? "PDF documents must be 10 MB or smaller."
            : "Images must be 5 MB or smaller."
          : error.message || "The upload could not be processed.",
    });
  });
};

router.post(
  "/login-appearance/wallpaper",
  receiveFile(wallpaperUpload, "wallpaper"),
  uploadLoginWallpaper
);

router.put(
  "/login-appearance",
  saveLoginAppearance
);

router.post(
  "/seasonal-branding/icon",
  receiveFile(logoUpload, "icon"),
  uploadSeasonalIcon
);

router.post(
  "/seasonal-branding/campaigns",
  scheduleSeasonalCampaign
);

router.get("/", getSettings);
router.put("/", updateSettings);
router.put("/storage/status", setStorageChargingStatus);

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