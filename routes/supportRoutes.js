const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
  getTickets,
  createTicket,
  addReplyToTicket,
  updateTicketStatus,
  getSupportStaff,
  assignTicket,
  addInternalNote,
  updateCustomerSatisfaction,
  reopenTicket,
} = require("../controllers/supportController");

const { protect } = require("../middleware/authMiddleware");

const uploadDir = path.join(__dirname, "../uploads/support-attachments");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    cb(null, uniqueName);
  },
});

const allowedTypes = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, JPG, JPEG, PNG, and WEBP files are allowed"));
    }
  },
});

router.get("/", protect, getTickets);
router.get("/staff", protect, getSupportStaff);
router.post("/", protect, upload.single("attachmentFile"), createTicket);
router.post("/:ticketNumber/reply", protect, upload.single("attachmentFile"), addReplyToTicket);
router.put("/:ticketNumber/status", protect, updateTicketStatus);
router.put("/:ticketNumber/assign", protect, assignTicket);
router.post("/:ticketNumber/internal-note", protect, addInternalNote);
router.put("/:ticketNumber/satisfaction", protect, updateCustomerSatisfaction);
router.put("/:ticketNumber/reopen", protect, reopenTicket);

module.exports = router;