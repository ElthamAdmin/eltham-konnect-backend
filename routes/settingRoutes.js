const express = require("express");
const router = express.Router();

const {
  getSettings,
  updateSettings,
  uploadPrimaryLogo,
  uploadInvoiceLogo,
  getCompanyDocuments,
  uploadCompanyDocument,
} = require("../controllers/settingController");

const { logoUpload, documentUpload } = require("../middleware/upload");

router.get("/", getSettings);
router.put("/", updateSettings);

router.post("/upload-primary-logo", logoUpload.single("logo"), uploadPrimaryLogo);
router.post("/upload-invoice-logo", logoUpload.single("logo"), uploadInvoiceLogo);

router.get("/documents", getCompanyDocuments);
router.post(
  "/documents/upload",
  documentUpload.single("document"),
  uploadCompanyDocument
);

module.exports = router;