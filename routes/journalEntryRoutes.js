const express = require("express");

const router = express.Router();

const {
  getJournalEntries,
  createJournalEntry,
  getJournalEntryByNumber,
  getJournalEntryHealth,
  reverseJournalEntry,
  createDraftJournalEntry,
  submitJournalEntryForApproval,
  approveJournalEntry,
  postApprovedJournal,
} = require("../controllers/journalEntryController");

const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getJournalEntries);
router.get("/health", protect, getJournalEntryHealth);
router.get("/:entryNumber", protect, getJournalEntryByNumber);
router.post("/:entryNumber/reverse", protect, reverseJournalEntry);

router.post("/", protect, createJournalEntry);
router.post("/draft", protect, createDraftJournalEntry);
router.post("/:entryNumber/submit", protect, submitJournalEntryForApproval);
router.post("/:entryNumber/approve", protect, approveJournalEntry);
router.post("/:entryNumber/post", protect, postApprovedJournal);

module.exports = router;