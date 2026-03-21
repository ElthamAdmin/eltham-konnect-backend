const express = require("express");
const router = express.Router();

const {
  getCommunicationLogs,
  createCommunicationLog,
} = require("../controllers/communicationController");

const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getCommunicationLogs);
router.post("/", protect, createCommunicationLog);

module.exports = router;