const JournalEntry = require("../models/JournalEntry");
const { postJournalEntry } = require("../utils/generalLedgerPoster");

const getJournalEntries = async (req, res) => {
  try {
    const entries = await JournalEntry.find().sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: entries,
    });
  } catch (error) {
    console.error("Error loading journal entries:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve journal entries",
      error: error.message,
    });
  }
};

const createJournalEntry = async (req, res) => {
  try {
    const {
      entryDate,
      memo,
      reference,
      sourceModule,
      lines,
    } = req.body;

    const entry = await postJournalEntry({
      entryDate,
      memo,
      reference,
      sourceModule,
      lines,
      createdBy: req.user?.name || "System User",
    });

    res.status(201).json({
      success: true,
      message: "Journal entry posted successfully",
      data: entry,
    });
  } catch (error) {
    console.error("Error creating journal entry:", error);

    res.status(500).json({
      success: false,
      message: "Could not create journal entry",
      error: error.message,
    });
  }
};

module.exports = {
  getJournalEntries,
  createJournalEntry,
};