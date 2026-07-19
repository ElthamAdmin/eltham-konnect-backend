const mongoose = require("mongoose");

const JournalEntry = require("../../models/JournalEntry");
const ChartOfAccount = require("../../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../../models/GeneralLedgerTransaction");
const AccountingPeriod = require("../../models/AccountingPeriod");
const FiscalYear = require("../../models/FiscalYear");

const { roundMoney } = require("./money");
const { validateJournalLines } = require("./validationService");
const {
  calculateUpdatedBalance,
  syncFinancialAccountsForChartAccount,
} = require("./balanceService");

const { writeFinanceAuditLog } = require("../../utils/financeAuditHelper");

const generateEntryNumber = () =>
  `JE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const generateLedgerNumber = () =>
  `GL-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const validateAccountingPeriodOpen = async (entryDate) => {
  const postingDate = new Date(entryDate);

  if (Number.isNaN(postingDate.getTime())) {
    throw new Error("Invalid journal entry date.");
  }

  const fiscalYear = postingDate.getFullYear();
  const periodMonth = postingDate.getMonth() + 1;

  const accountingPeriod = await AccountingPeriod.findOne({
    fiscalYear,
    periodMonth,
  });

  if (accountingPeriod) {
    if (accountingPeriod.allowPosting === false) {
      throw new Error(
        `Accounting period ${accountingPeriod.periodName} is blocked for posting.`
      );
    }

    if (["Closing", "Closed", "Locked"].includes(accountingPeriod.status)) {
      throw new Error(
        `Accounting period ${accountingPeriod.periodName} is ${accountingPeriod.status}. Posting is not allowed.`
      );
    }
  }

  const fiscalYearRecord = await FiscalYear.findOne({
    fiscalYear,
  });

  if (fiscalYearRecord) {
    if (fiscalYearRecord.allowPosting === false) {
      throw new Error(
        `Fiscal year ${fiscalYearRecord.yearName} is blocked for posting.`
      );
    }

    if (["Closing", "Closed", "Locked"].includes(fiscalYearRecord.status)) {
      throw new Error(
        `Fiscal year ${fiscalYearRecord.yearName} is ${fiscalYearRecord.status}. Posting is not allowed.`
      );
    }
  }
};

const postJournalEntry = async ({
  entryDate,
  memo = "",
  reference = "",
  sourceModule = "",
  entityId = null,
  entityCode = "",
  entitySnapshot = null,
  createdBy = "System User",
  lines = [],
}) => {
  const { totalDebit, totalCredit } = validateJournalLines(lines);

  await validateAccountingPeriodOpen(entryDate);

  const session = await mongoose.startSession();

  try {
    let createdEntry = null;

        const createdLedgerNumbers = [];

    await session.withTransaction(async () => {
      const entryNumber = generateEntryNumber();
      const preparedLines = [];

      for (const line of lines) {
        const account = await ChartOfAccount.findOne({
          accountCode: line.accountCode,
          status: "Active",
        }).session(session);

        if (!account) {
          throw new Error(`Active chart account ${line.accountCode} not found.`);
        }

        const debit = roundMoney(line.debit);
        const credit = roundMoney(line.credit);

        const updatedBalance = calculateUpdatedBalance({
          currentBalance: account.currentBalance,
          normalBalance: account.normalBalance,
          debit,
          credit,
        });

        account.currentBalance = updatedBalance;
        await account.save({ session });

        preparedLines.push({
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountCategory: account.accountCategory,
          normalBalance: account.normalBalance,
          debit,
          credit,
          runningBalance: updatedBalance,
          description: line.description || "",
        });
      }

      const entries = await JournalEntry.create(
        [
          {
            entryNumber,
            entryDate,
            memo,
            reference,
            sourceModule,
            entityId,
entityCode,
entitySnapshot,
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
          },
        ],
        { session }
      );

      createdEntry = entries[0];

      for (const line of preparedLines) {
        const ledgerNumber = generateLedgerNumber();
        createdLedgerNumbers.push(ledgerNumber);

        await GeneralLedgerTransaction.create(
          [
            {
              ledgerNumber,
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
entityId,
entityCode,
entitySnapshot,
memo,
              description: line.description,
            },
          ],
          { session }
        );

        await syncFinancialAccountsForChartAccount(line.accountCode, session);
      }
    });

    await writeFinanceAuditLog({
      action: "JOURNAL_POSTED",
      description: `Journal entry ${createdEntry.entryNumber} posted from ${sourceModule || "Manual"}`,
      targetType: "JournalEntry",
      targetId: createdEntry.entryNumber,
      postingDate: entryDate,
      journalEntry: createdEntry,
      performedByName: createdBy,
      metadata: {
        memo,
        reference,
        sourceModule,
        totalDebit,
        totalCredit,
        ledgerNumbers: createdLedgerNumbers,
        lineCount: lines.length,
      },
    });

    return createdEntry;
  } finally {
    session.endSession();
  }
};

const postApprovedJournalEntry = async ({ entryNumber, postedBy = "System User" }) => {
  const session = await mongoose.startSession();

  try {
    let postedEntry = null;

        const createdLedgerNumbers = [];

    await session.withTransaction(async () => {
      const entry = await JournalEntry.findOne({ entryNumber }).session(session);

      if (!entry) {
        throw new Error("Journal entry not found.");
      }

      if (!["Approved", "Pending Approval", "Draft"].includes(entry.status)) {
        throw new Error(`Journal entry cannot be posted from status ${entry.status}.`);
      }

      if (entry.locked) {
        throw new Error("Journal entry is locked and cannot be posted again.");
      }

      const { totalDebit, totalCredit } = validateJournalLines(entry.lines || []);

      await validateAccountingPeriodOpen(entry.entryDate);

      const preparedLines = [];

      for (const line of entry.lines || []) {
        const account = await ChartOfAccount.findOne({
          accountCode: line.accountCode,
          status: "Active",
        }).session(session);

        if (!account) {
          throw new Error(`Active chart account ${line.accountCode} not found.`);
        }

        const debit = roundMoney(line.debit);
        const credit = roundMoney(line.credit);

        const updatedBalance = calculateUpdatedBalance({
          currentBalance: account.currentBalance,
          normalBalance: account.normalBalance,
          debit,
          credit,
        });

        account.currentBalance = updatedBalance;
        await account.save({ session });

        preparedLines.push({
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountCategory: account.accountCategory,
          normalBalance: account.normalBalance,
          debit,
          credit,
          runningBalance: updatedBalance,
          description: line.description || "",
        });
      }

      for (const line of preparedLines) {
        const ledgerNumber = generateLedgerNumber();
        createdLedgerNumbers.push(ledgerNumber);

        await GeneralLedgerTransaction.create(
          [
            {
              ledgerNumber,
              entryNumber: entry.entryNumber,
              entryDate: entry.entryDate,
              accountCode: line.accountCode,
              accountName: line.accountName,
              accountCategory: line.accountCategory,
              normalBalance: line.normalBalance,
              debit: line.debit,
              credit: line.credit,
              runningBalance: line.runningBalance,
              reference: entry.reference,
              sourceModule: entry.sourceModule,
              entityId: entry.entityId || null,
entityCode: entry.entityCode || "",
entitySnapshot: entry.entitySnapshot || null,
              memo: entry.memo,
              description: line.description,
              postedBy,
              postedAt: new Date(),
              locked: true,
            },
          ],
          { session }
        );

        await syncFinancialAccountsForChartAccount(line.accountCode, session);
      }

      entry.totalDebit = totalDebit;
      entry.totalCredit = totalCredit;
      entry.status = "Posted";
      entry.postedBy = postedBy;
      entry.postedAt = new Date();
      entry.locked = true;

      postedEntry = await entry.save({ session });
    });

    await writeFinanceAuditLog({
      action: "APPROVED_JOURNAL_POSTED",
      description: `Approved journal entry ${postedEntry.entryNumber} posted`,
      targetType: "JournalEntry",
      targetId: postedEntry.entryNumber,
      postingDate: postedEntry.entryDate,
      journalEntry: postedEntry,
      performedByName: postedBy,
      metadata: {
        memo: postedEntry.memo,
        reference: postedEntry.reference,
        sourceModule: postedEntry.sourceModule,
        totalDebit: postedEntry.totalDebit,
        totalCredit: postedEntry.totalCredit,
        ledgerNumbers: createdLedgerNumbers,
        lineCount: postedEntry.lines?.length || 0,
      },
    });

    return postedEntry;
  } finally {
    session.endSession();
  }
};

module.exports = {
  postJournalEntry,
  postApprovedJournalEntry,
  validateAccountingPeriodOpen,
};