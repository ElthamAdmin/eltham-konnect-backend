const JournalEntry = require("../models/JournalEntry");
const ChartOfAccount = require("../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

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

  const entryNumber = `JE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const preparedLines = [];

  for (const line of lines) {
    const account = await ChartOfAccount.findOne({
      accountCode: line.accountCode,
    });

    if (!account) {
      throw new Error(`Chart account ${line.accountCode} not found`);
    }

    const debit = roundMoney(line.debit);
    const credit = roundMoney(line.credit);

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

    preparedLines.push({
      accountCode: account.accountCode,
      accountName: account.accountName,
      debit,
      credit,
      description: line.description || "",
      accountCategory: account.accountCategory,
      normalBalance: account.normalBalance,
      runningBalance: account.currentBalance,
    });
  }

  const entry = await JournalEntry.create({
    entryNumber,
    entryDate,
    memo,
    reference,
    sourceModule,
    createdBy,
    totalDebit,
    totalCredit,
    status: "Posted",
    lines: preparedLines.map((line) => ({
      accountCode: line.accountCode,
      accountName: line.accountName,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
    })),
  });

  for (const line of preparedLines) {
    await GeneralLedgerTransaction.create({
      ledgerNumber: `GL-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      entryNumber,
      entryDate,
      accountCode: line.accountCode,
      accountName: line.accountName,
      accountCategory: line.accountCategory,
      normalBalance: line.normalBalance,
      debit: line.debit,
      credit: line.credit,
      runningBalance: line.runningBalance,
      reference,
      sourceModule,
      memo,
      description: line.description,
    });
  }

  return entry;
};

module.exports = {
  postJournalEntry,
};