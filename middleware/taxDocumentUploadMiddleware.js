const multer = require("multer");

const MAX_TAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

const ALLOWED_TAX_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
]);

const storage = multer.memoryStorage();

const taxDocumentUpload = multer({
  storage,

  limits: {
    fileSize: MAX_TAX_DOCUMENT_SIZE,
    files: 1,
  },

  fileFilter: (req, file, callback) => {
    if (!ALLOWED_TAX_DOCUMENT_TYPES.has(file.mimetype)) {
      return callback(
        new Error(
          "Unsupported tax-document format. Upload a PDF, JPEG, PNG, WEBP, XLSX, XLS or CSV file."
        )
      );
    }

    return callback(null, true);
  },
}).single("document");

const receiveTaxDocumentUpload = (req, res, next) => {
  taxDocumentUpload(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message:
            "The tax document exceeds the maximum upload size of 10 MB.",
        });
      }

      return res.status(400).json({
        success: false,
        message: `Tax document upload failed: ${error.message}`,
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Tax document upload failed.",
    });
  });
};

module.exports = {
  receiveTaxDocumentUpload,
};