const mongoose = require("mongoose");

const JournalEntry = require("../../models/JournalEntry");
const ChartOfAccount = require("../../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../../models/GeneralLedgerTransaction");
const AccountingPeriod = require("../../models/AccountingPeriod");

const { roundMoney } = require("./money");
const { validateJournalLines } = require("./validationService");
const {
  calculateUpdatedBalance,
  syncFinancialAccountsForChartAccount,
} = require("./balanceService");

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

  if (!accountingPeriod) return;

  if (["Closed", "Locked"].includes(accountingPeriod.status)) {
    throw new Error(
      `Accounting period ${accountingPeriod.periodName} is ${accountingPeriod.status}. Posting is not allowed.`
    );
  }
};

const postJournalEntry = async ({
  entryDate,
  memo = "",
  reference = "",
  sourceModule = "",
  createdBy = "System User",
  lines = [],
}) => {
  const { totalDebit, totalCredit } = validateJournalLines(lines);

  await validateAccountingPeriodOpen(entryDate);

  const session = await mongoose.startSession();

  try {
    let createdEntry = null;

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
        await GeneralLedgerTransaction.create(
          [
            {
              ledgerNumber: generateLedgerNumber(),
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
            },
          ],
          { session }
        );

        await syncFinancialAccountsForChartAccount(line.accountCode, session);
      }
    });

    return createdEntry;
  } finally {
    session.endSession();
  }
};

module.exports = {
  postJournalEntry,
  validateAccountingPeriodOpen,
};