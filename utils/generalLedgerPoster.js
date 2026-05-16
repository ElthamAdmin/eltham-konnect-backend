const JournalEntry = require("../models/JournalEntry");
const ChartOfAccount = require("../models/ChartOfAccount");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const postJournalEntry = async ({
  entryDate,
  memo,
  reference,
  sourceModule,
  createdBy,
  lines = [],
}) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Journal entry lines are required.");
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    totalDebit += Number(line.debit || 0);
    totalCredit += Number(line.credit || 0);
  }

  totalDebit = roundMoney(totalDebit);
  totalCredit = roundMoney(totalCredit);

  if (totalDebit !== totalCredit) {
    throw new Error("Journal entry is not balanced.");
  }

  for (const line of lines) {
    const account = await ChartOfAccount.findOne({
      accountCode: line.accountCode,
    });

    if (!account) {
      throw new Error(
        `Chart account ${line.accountCode} not found`
      );
    }

    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    let updatedBalance = Number(account.currentBalance || 0);

    if (account.normalBalance === "Debit") {
      updatedBalance += debit;
      updatedBalance -= credit;
    } else {
      updatedBalance -= debit;
      updatedBalance += credit;
    }

    account.currentBalance = roundMoney(updatedBalance);

    await account.save();
  }

  const entry = await JournalEntry.create({
    entryNumber: `JE-${Date.now()}`,
    entryDate,
    memo,
    reference,
    sourceModule,
    createdBy,
    totalDebit,
    totalCredit,
    status: "Posted",
    lines,
  });

  return entry;
};

module.exports = {
  postJournalEntry,
};