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

const getJournalEntryByNumber = async (req, res) => {
  try {
    const { entryNumber } = req.params;

    const entry = await JournalEntry.findOne({ entryNumber });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Journal entry not found",
      });
    }

    res.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    console.error("Error loading journal entry:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve journal entry",
      error: error.message,
    });
  }
};

const getJournalEntryHealth = async (req, res) => {
  try {
    const entries = await JournalEntry.find();

    const unbalanced = entries.filter(
      (entry) =>
        Number(Number(entry.totalDebit || 0).toFixed(2)) !==
        Number(Number(entry.totalCredit || 0).toFixed(2))
    );

    const missingLines = entries.filter(
      (entry) => !entry.lines || entry.lines.length < 2
    );

    const draftCount = entries.filter((entry) => entry.status === "Draft").length;
    const postedCount = entries.filter((entry) => entry.status === "Posted").length;
    const reversedCount = entries.filter((entry) => entry.status === "Reversed").length;

    res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        totalEntries: entries.length,
        postedCount,
        draftCount,
        reversedCount,
        unbalancedCount: unbalanced.length,
        missingLinesCount: missingLines.length,
        isHealthy: unbalanced.length === 0 && missingLines.length === 0,
        unbalanced,
        missingLines,
      },
    });
  } catch (error) {
    console.error("Journal health error:", error);

    res.status(500).json({
      success: false,
      message: "Could not run journal health check",
      error: error.message,
    });
  }
};

const reverseJournalEntry = async (req, res) => {
  try {
    const { entryNumber } = req.params;
    const { reversalReason } = req.body;

    const originalEntry = await JournalEntry.findOne({ entryNumber });

    if (!originalEntry) {
      return res.status(404).json({
        success: false,
        message: "Original journal entry not found",
      });
    }

    if (originalEntry.status === "Reversed") {
      return res.status(400).json({
        success: false,
        message: "Journal entry has already been reversed",
      });
    }

    const reversalLines = (originalEntry.lines || []).map((line) => ({
      accountCode: line.accountCode,
      accountName: line.accountName,
      debit: Number(line.credit || 0),
      credit: Number(line.debit || 0),
      description: `Reversal of ${originalEntry.entryNumber}: ${line.description || ""}`,
    }));

    const reversalEntry = await postJournalEntry({
      entryDate: new Date().toISOString().slice(0, 10),
      memo: `Reversal of ${originalEntry.entryNumber}`,
      reference: originalEntry.reference,
      sourceModule: "Journal Reversal",
      lines: reversalLines,
      createdBy: req.user?.name || req.user?.email || "System User",
    });

    originalEntry.status = "Reversed";
    originalEntry.reversedBy = req.user?.name || req.user?.email || "System User";
    originalEntry.reversedAt = new Date();
    originalEntry.reversalEntryNumber = reversalEntry.entryNumber;
    originalEntry.reversalReason = reversalReason || "Journal reversal";
    originalEntry.locked = true;

    await originalEntry.save();

    res.json({
      success: true,
      message: "Journal entry reversed successfully",
      data: {
        originalEntry,
        reversalEntry,
      },
    });
  } catch (error) {
    console.error("Reverse journal entry error:", error);

    res.status(500).json({
      success: false,
      message: "Could not reverse journal entry",
      error: error.message,
    });
  }
};

module.exports = {
  getJournalEntries,
  createJournalEntry,
  getJournalEntryByNumber,
  getJournalEntryHealth,
  reverseJournalEntry,
};