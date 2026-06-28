const JournalEntry = require("../../models/JournalEntry");
const { postJournalEntry } = require("./journalService");

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const reverseJournalEntry = async ({
  entryNumber,
  reversalDate = new Date().toISOString().slice(0, 10),
  reason = "",
  user,
}) => {
  if (!entryNumber) {
    throw new Error("Original journal entry number is required.");
  }

  const originalEntry = await JournalEntry.findOne({ entryNumber });

  if (!originalEntry) {
    throw new Error(`Journal entry ${entryNumber} not found.`);
  }

  if (originalEntry.status === "Reversed") {
    throw new Error(`Journal entry ${entryNumber} has already been reversed.`);
  }

  if (!Array.isArray(originalEntry.lines) || originalEntry.lines.length === 0) {
    throw new Error(`Journal entry ${entryNumber} has no lines to reverse.`);
  }

  const reversalLines = originalEntry.lines.map((line) => ({
    accountCode: line.accountCode,
    debit: Number(line.credit || 0),
    credit: Number(line.debit || 0),
    description: `Reversal of ${entryNumber}: ${line.description || ""}`,
  }));

  const reversalEntry = await postJournalEntry({
    entryDate: reversalDate,
    memo: `Reversal of ${entryNumber}${reason ? ` - ${reason}` : ""}`,
    reference: `REV-${entryNumber}`,
    sourceModule: originalEntry.sourceModule || "Journal Reversal",
    createdBy: getUserName(user),
    lines: reversalLines,
  });

  originalEntry.status = "Reversed";
  await originalEntry.save();

  return {
    originalEntry,
    reversalEntry,
  };
};

module.exports = {
  reverseJournalEntry,
};