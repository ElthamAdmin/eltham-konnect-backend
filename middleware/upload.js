const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const logosDir = path.join(__dirname, "..", "uploads", "logos");
const documentsDir = path.join(__dirname, "..", "uploads", "documents");

ensureDir(logosDir);
ensureDir(documentsDir);

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, logosDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `logo-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, documentsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `doc-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpg|jpeg|png|webp|svg/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mime =
      file.mimetype.startsWith("image/") ||
      file.mimetype === "image/svg+xml";

    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error("Only image logo files are allowed"));
    }
  },
});

const documentUpload = multer({
  storage: documentStorage,
  fileFilter: (req, file, cb) => {
    const isPdf =
      path.extname(file.originalname).toLowerCase() === ".pdf" &&
      file.mimetype === "application/pdf";

    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

module.exports = {
  logoUpload,
  documentUpload,
};