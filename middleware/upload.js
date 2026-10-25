const multer = require("multer");

const makeUpload = (allowedTypes, maxBytes, message) =>
  multer({
    storage: multer.memoryStorage(),

    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: 5,
    },

    fileFilter: (req, file, cb) => {
      if (allowedTypes.includes(file.mimetype)) {
        return cb(null, true);
      }

      return cb(new Error(message));
    },
  });

const logoUpload = makeUpload(
  ["image/jpeg", "image/png", "image/webp"],
  5 * 1024 * 1024,
  "Please choose a JPG, PNG or WebP logo."
);

const documentUpload = makeUpload(
  ["application/pdf"],
  10 * 1024 * 1024,
  "Only PDF documents are allowed."
);

module.exports = {
  logoUpload,
  documentUpload,
};