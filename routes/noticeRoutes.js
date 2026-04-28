const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();

const {
  getNotices,
  createNotice,
  deleteNotice,
} = require("../controllers/noticeController");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/notice-board");
  },
  filename: (req, file, cb) => {
    const uniqueName = `notice-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

router.get("/", getNotices);
router.post("/", upload.single("noticeImage"), createNotice);
router.delete("/:id", deleteNotice);

module.exports = router;