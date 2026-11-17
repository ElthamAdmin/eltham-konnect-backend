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

const validateAccountingPeriodOpen = async (
  entryDate,
  session = null
) => {
  const fail = (message) => {
    const error = new Error(message);
    error.statusCode = 409;
    throw error;
  };

  if (
    typeof entryDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)
  ) {
    fail("Enter a valid YYYY-MM-DD journal posting date.");
  }

  const parsed = new Date(`${entryDate}T00:00:00Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== entryDate
  ) {
    fail("Enter a valid journal posting date.");
  }

  const fiscalYear = parsed.getUTCFullYear();
  const periodMonth = parsed.getUTCMonth() + 1;

  const period = await AccountingPeriod.findOne({
    fiscalYear,
    periodMonth,
  }).session(session);

  if (!period) {
    fail(
      `Create the accounting period for ${entryDate.slice(0, 7)} before posting.`
    );
  }

  if (
    entryDate < period.startDate ||
    entryDate > period.endDate
  ) {
    fail("The posting date is outside the recorded accounting period.");
  }

  if (
    period.status !== "Open" ||
    period.allowPosting !== true
  ) {
    fail(
      `Accounting period ${period.periodName} is blocked for posting (${period.status}).`
    );
  }

  const fiscalYearRecord = await FiscalYear.findOne({
    fiscalYear,
  }).session(session);

  if (
    fiscalYearRecord &&
    (
      fiscalYearRecord.allowPosting === false ||
      fiscalYearRecord.status !== "Open"
    )
  ) {
    fail(
      `Fiscal year ${fiscalYearRecord.yearName || fiscalYear} is blocked for posting.`
    );
  }

  if (session) {
    if (!session.inTransaction()) {
      fail("Posting controls require an active transaction.");
    }

    // A concurrent close and posting cannot both commit against this period.
    const guarded = await AccountingPeriod.findOneAndUpdate(
      {
        _id: period._id,
        status: "Open",
        allowPosting: true,
      },
      {
        $inc: { postingRevision: 1 },
      },
      {
        new: true,
        session,
      }
    );

    if (!guarded) {
      fail("The accounting period changed. Refresh and try again.");
    }
  }

  return period;
};

const postJournalEntry = async ({
  entryDate,
  memo = "",
  reference = "",
  sourceModule = "",
  entityId = null,
  entityCode = "",
  entitySnapshot = null,
  reportingPeriodKey = "",
  createdBy = "System User",
  lines = [],
  session: providedSession = null,
}) => {
  const { totalDebit, totalCredit } =
    validateJournalLines(lines);

  if (
    providedSession &&
    !providedSession.inTransaction()
  ) {
    throw new Error(
      "The supplied journal session must have an active transaction."
    );
  }

  const ownsSession = !providedSession;
  const session =
    providedSession || (await mongoose.startSession());

  let createdEntry = null;

  const postWithinSession = async () => {
    await validateAccountingPeriodOpen(
      entryDate,
      session
    );

    const entryNumber = generateEntryNumber();
    const preparedLines = [];
    const createdLedgerNumbers = [];

    for (const line of lines) {
      const account = await ChartOfAccount.findOne({
        accountCode: line.accountCode,
        status: "Active",
      }).session(session);

      if (!account) {
        throw new Error(
          `Active chart account ${line.accountCode} not found.`
        );
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
          reportingPeriodKey,
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
            reportingPeriodKey,
            memo,
            description: line.description,
          },
        ],
        { session }
      );

      await syncFinancialAccountsForChartAccount(
        line.accountCode,
        session
      );
    }

    await writeFinanceAuditLog({
      session,
      action: "JOURNAL_POSTED",
      description:
        `Journal entry ${createdEntry.entryNumber} ` +
        `posted from ${sourceModule || "Manual"}`,
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
  };

  try {
    if (providedSession) {
      await postWithinSession();
    } else {
      await session.withTransaction(postWithinSession);
    }

    return createdEntry;
  } finally {
    if (ownsSession) {
      await session.endSession();
    }
  }
};

const postApprovedJournalEntry = async ({
  entryNumber,
  postedBy = "System User",
  session: providedSession = null,
  skipFinancialSyncForCodes = [],
}) => {
  if (providedSession && !providedSession.inTransaction()) {
    throw new Error(
      "The supplied journal session must have an active transaction."
    );
  }

  const postWithinSession = async (session) => {
    const entry = await JournalEntry.findOne({
      entryNumber,
    }).session(session);

    if (!entry) {
      throw new Error("Journal entry not found.");
    }

    if (
      entry.status !== "Approved" ||
      !entry.approvedBy ||
      !entry.approvedAt
    ) {
      throw new Error(
        "Only an approved journal with approval details can be posted."
      );
    }

    if (entry.locked) {
      throw new Error("Journal entry is locked.");
    }

    const existingLedger = await GeneralLedgerTransaction.findOne({
      entryNumber,
    }).session(session);

    if (existingLedger) {
      throw new Error(
        "Ledger lines already exist for this journal. Review before posting."
      );
    }

    const { totalDebit, totalCredit } = validateJournalLines(
      entry.lines || []
    );

    await validateAccountingPeriodOpen(
      entry.entryDate,
      session
    );

    const createdLedgerNumbers = [];
    const postedAt = new Date();

    for (const line of entry.lines || []) {
      const account = await ChartOfAccount.findOne({
        accountCode: line.accountCode,
        status: "Active",
      }).session(session);

      if (!account) {
        throw new Error(
          `Active chart account ${line.accountCode} not found.`
        );
      }

      const debit = roundMoney(line.debit);
      const credit = roundMoney(line.credit);

      account.currentBalance = calculateUpdatedBalance({
        currentBalance: account.currentBalance,
        normalBalance: account.normalBalance,
        debit,
        credit,
      });

      await account.save({ session });

      const ledgerNumber = generateLedgerNumber();
      createdLedgerNumbers.push(ledgerNumber);

      await GeneralLedgerTransaction.create(
        [
          {
            ledgerNumber,
            entryNumber: entry.entryNumber,
            entryDate: entry.entryDate,
            accountCode: account.accountCode,
            accountName: account.accountName,
            accountCategory: account.accountCategory,
            normalBalance: account.normalBalance,
            debit,
            credit,
            runningBalance: account.currentBalance,
                        reference: entry.reference,
            sourceModule: entry.sourceModule,
            adjustmentBatchNumber: entry.adjustmentBatchNumber || undefined,
            entityId: entry.entityId || null,
            entityCode: entry.entityCode || "",
            entitySnapshot: entry.entitySnapshot || null,
            reportingPeriodKey: entry.reportingPeriodKey || "",
            branch: entry.branch || "",
            memo: entry.memo,
            description: line.description || "",
            sourceDocumentType: entry.sourceDocumentType || "",
            sourceDocumentNumber: entry.sourceDocumentNumber || "",
            sourceDocumentId: entry.sourceDocumentId || "",
            postedBy,
            postedAt,
            locked: true,
          },
        ],
        { session }
      );

      if (!skipFinancialSyncForCodes.includes(account.accountCode)) {
        await syncFinancialAccountsForChartAccount(
          account.accountCode,
          session
        );
      }
    }

    entry.totalDebit = totalDebit;
    entry.totalCredit = totalCredit;
    entry.status = "Posted";
    entry.postedBy = postedBy;
    entry.postedAt = postedAt;
    entry.locked = true;

    const result = await entry.save({ session });

    await writeFinanceAuditLog({
      session,
      action: "APPROVED_JOURNAL_POSTED",
      description:
        `Approved journal entry ${entryNumber} posted`,
      targetType: "JournalEntry",
      targetId: entryNumber,
      postingDate: entry.entryDate,
      journalEntry: result,
      performedByName: postedBy,
      metadata: {
        ledgerNumbers: createdLedgerNumbers,
        totalDebit,
        totalCredit,
      },
    });

    return result;
  };

  return providedSession
    ? postWithinSession(providedSession)
    : mongoose.connection.transaction(postWithinSession);
};

module.exports = {
  postJournalEntry,
  postApprovedJournalEntry,
  validateAccountingPeriodOpen,
};