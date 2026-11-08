const express = require("express");

const router = express.Router();

const {
  getJournalEntries,
  getJournalEntryByNumber,
  getJournalEntryHealth,
} = require("../controllers/journalEntryController");

const manual = require("../controllers/manualJournalController");

const {
  protect,
  requireAdmin,
  requirePermission,
} = require("../middleware/authMiddleware");

router.get("/", protect, getJournalEntries);
router.get("/health", protect, getJournalEntryHealth);
router.get("/options", protect, manual.getOptions);

router.post(
  "/opening-preview",
  protect,
  requireAdmin,
  manual.previewOpening
);

router.post(
  "/opening-draft",
  protect,
  requireAdmin,
  manual.createOpeningDraft
);

router.post(
  "/draft",
  protect,
  requirePermission("finance"),
  manual.createDraft
);

// The old direct-post URL now saves a draft.
// It no longer bypasses approval.
router.post(
  "/",
  protect,
  requirePermission("finance"),
  manual.createDraft
);

router.post(
  "/:entryNumber/submit",
  protect,
  requirePermission("finance"),
  manual.submit
);

router.post(
  "/:entryNumber/approve",
  protect,
  requireAdmin,
  manual.approve
);

router.post(
  "/:entryNumber/post",
  protect,
  requireAdmin,
  manual.post
);

router.post(
  "/:entryNumber/reverse",
  protect,
  requireAdmin,
  manual.reverse
);

router.delete(
  "/:entryNumber/draft",
  protect,
  requireAdmin,
  manual.discard
);

router.get(
  "/:entryNumber",
  protect,
  getJournalEntryByNumber
);

module.exports = router;