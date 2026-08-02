const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
  uploadDocument,
  getEmployeeDocuments,
  deleteDocument,
  removeMissingDocuments,
} = require(
  "../controllers/documentController"
);

const {
  uploadControlledDocument,
  getControlledEmployeeDocuments,
  getControlledDocumentByNumber,
  createControlledDownload,
} = require(
  "../controllers/employmentDocumentController"
);

const {
  previewLegacyEmploymentDocumentMigration,
} = require(
  "../controllers/employmentDocumentMigrationController"
);

const {
  protect,
  requireAnyPermission,
  requirePermission,
} = require(
  "../middleware/authMiddleware"
);

const canAccessDocumentSelfService =
  requireAnyPermission([
    "hr",
    "documentSelfService",
  ]);

/*
 * H6 controlled Cloudinary uploads.
 *
 * Files remain in memory only until
 * the controlled controller sends
 * them to authenticated Cloudinary
 * storage.
 */

const controlledAllowedTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

const controlledUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize:
      10 * 1024 * 1024,

    files: 1,
  },

  fileFilter: (
    req,
    file,
    callback
  ) => {
    if (
      controlledAllowedTypes.includes(
        file.mimetype
      )
    ) {
      callback(null, true);
      return;
    }

    callback(
      new Error(
        "Only PDF, JPG, JPEG, PNG, WEBP, DOC and DOCX employment documents are allowed."
      )
    );
  },
});

const controlledUploadSingle =
  (req, res, next) => {
    controlledUpload.single(
      "file"
    )(
      req,
      res,
      (error) => {
        if (!error) {
          next();
          return;
        }

        const isSizeError =
          error.code ===
          "LIMIT_FILE_SIZE";

        return res
          .status(400)
          .json({
            success: false,

            message:
              isSizeError
                ? "Employment documents cannot exceed 10 MB."
                : error.message ||
                  "The employment document could not be processed.",
          });
      }
    );
  };

/*
 * Controlled H6 routes.
 *
 * These routes must remain above
 * the legacy generic
 * /:employeeId route.
 */

router.get(
  "/controlled/legacy-migration-preview",
  protect,
  requirePermission("hr"),
  previewLegacyEmploymentDocumentMigration
);

router.post(
  "/controlled/upload/:employeeId",
  protect,
  canAccessDocumentSelfService,
  controlledUploadSingle,
  uploadControlledDocument
);

router.get(
  "/controlled/employee/:employeeId",
  protect,
  canAccessDocumentSelfService,
  getControlledEmployeeDocuments
);

router.get(
  "/controlled/:documentNumber",
  protect,
  canAccessDocumentSelfService,
  getControlledDocumentByNumber
);

router.post(
  "/controlled/:documentNumber/download",
  protect,
  canAccessDocumentSelfService,
  createControlledDownload
);

/*
 * Legacy embedded-document routes.
 *
 * These remain temporarily available
 * until the preview-only H6 migration
 * confirms every existing signed
 * document.
 */

const uploadDir = path.join(
  __dirname,
  "../uploads/hr-documents"
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

const storage =
  multer.diskStorage({
    destination: function (
      req,
      file,
      callback
    ) {
      callback(
        null,
        uploadDir
      );
    },

    filename: function (
      req,
      file,
      callback
    ) {
      const uniqueName =
        `${Date.now()}-${file.originalname.replace(
          /\s+/g,
          "-"
        )}`;

      callback(
        null,
        uniqueName
      );
    },
  });

const allowedTypes = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

const upload = multer({
  storage,

  fileFilter: function (
    req,
    file,
    callback
  ) {
    if (
      allowedTypes.includes(
        file.mimetype
      )
    ) {
      callback(null, true);
    } else {
      callback(
        new Error(
          "Only PDF, JPG, JPEG, PNG, WEBP, DOC and DOCX files are allowed."
        )
      );
    }
  },
});

router.post(
  "/upload/:employeeId",
  protect,
  requireAnyPermission([
    "hr",
    "documentSelfService",
  ]),
  upload.single("file"),
  uploadDocument
);

router.get(
  "/:employeeId",
  protect,
  requireAnyPermission([
    "hr",
    "documentSelfService",
  ]),
  getEmployeeDocuments
);

router.delete(
  "/:employeeId/missing-files",
  protect,
  requirePermission("hr"),
  removeMissingDocuments
);

router.delete(
  "/:employeeId/:index",
  protect,
  requirePermission("hr"),
  deleteDocument
);

module.exports = router;