const express = require("express");

const router = express.Router();

const {
  getJournalEntries,
  createJournalEntry,
} = require("../controllers/journalEntryController");

const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getJournalEntries);

router.post("/", protect, createJournalEntry);

module.exports = router;