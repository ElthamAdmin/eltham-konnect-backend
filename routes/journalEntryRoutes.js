const express = require("express");

const router = express.Router();

const {
  getJournalEntries,
  createJournalEntry,
  getJournalEntryByNumber,
  getJournalEntryHealth,
  reverseJournalEntry,
} = require("../controllers/journalEntryController");

const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getJournalEntries);
router.get("/health", protect, getJournalEntryHealth);
router.get("/:entryNumber", protect, getJournalEntryByNumber);
router.post("/:entryNumber/reverse", protect, reverseJournalEntry);

router.post("/", protect, createJournalEntry);

module.exports = router;