const mongoose = require("mongoose");
const JournalEntry = require("../models/JournalEntry");
const ChartOfAccount = require("../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const SYSTEM_ACCOUNTS = {
  CASH_ON_HAND: "1000",
  NCB_BANK: "1010",
  ACCOUNTS_RECEIVABLE: "1100",
  INVENTORY: "1200",

  ACCOUNTS_PAYABLE: "2000",

  PAYE_PAYABLE: "2100",
  NIS_PAYABLE: "2110",
  NHT_PAYABLE: "2120",
  EDUCATION_TAX_PAYABLE: "2130",
  PENSION_PAYABLE: "2140",

  OWNER_EQUITY: "3000",
  RETAINED_EARNINGS: "3100",

  SHIPPING_REVENUE: "4000",
  MARKETPLACE_REVENUE: "4010",

  COST_OF_SALES: "5000",

  OPERATING_EXPENSE: "6000",
  PAYROLL_EXPENSE: "6100",
  RENT_EXPENSE: "6200",
  UTILITIES_EXPENSE: "6300",
};

const SYSTEM_ACCOUNT_DEFINITIONS = [
  {
    accountCode: "1000",
    accountName: "Cash on Hand",
    accountCategory: "Asset",
    normalBalance: "Debit",
  },
  {
    accountCode: "1010",
    accountName: "NCB Bank",
    accountCategory: "Asset",
    normalBalance: "Debit",
  },
  {
    accountCode: "1100",
    accountName: "Accounts Receivable",
    accountCategory: "Asset",
    normalBalance: "Debit",
  },
  {
    accountCode: "1200",
    accountName: "Inventory",
    accountCategory: "Asset",
    normalBalance: "Debit",
  },
  {
    accountCode: "2000",
    accountName: "Accounts Payable",
    accountCategory: "Liability",
    normalBalance: "Credit",
  },
  {
  accountCode: "2100",
  accountName: "PAYE Payable",
  accountCategory: "Liability",
  normalBalance: "Credit",
},
{
  accountCode: "2110",
  accountName: "NIS Payable",
  accountCategory: "Liability",
  normalBalance: "Credit",
},
{
  accountCode: "2120",
  accountName: "NHT Payable",
  accountCategory: "Liability",
  normalBalance: "Credit",
},
{
  accountCode: "2130",
  accountName: "Education Tax Payable",
  accountCategory: "Liability",
  normalBalance: "Credit",
},
{
  accountCode: "2140",
  accountName: "Pension Payable",
  accountCategory: "Liability",
  normalBalance: "Credit",
},
  {
    accountCode: "3000",
    accountName: "Owner Equity",
    accountCategory: "Equity",
    normalBalance: "Credit",
  },
  {
    accountCode: "3100",
    accountName: "Retained Earnings",
    accountCategory: "Equity",
    normalBalance: "Credit",
  },
  {
    accountCode: "4000",
    accountName: "Shipping Revenue",
    accountCategory: "Revenue",
    normalBalance: "Credit",
  },
  {
    accountCode: "4010",
    accountName: "Marketplace Revenue",
    accountCategory: "Revenue",
    normalBalance: "Credit",
  },
  {
    accountCode: "5000",
    accountName: "Cost of Sales",
    accountCategory: "Cost of Sales",
    normalBalance: "Debit",
  },
  {
    accountCode: "6000",
    accountName: "Operating Expense",
    accountCategory: "Expense",
    normalBalance: "Debit",
  },
  {
    accountCode: "6100",
    accountName: "Payroll Expense",
    accountCategory: "Expense",
    normalBalance: "Debit",
  },
  {
    accountCode: "6200",
    accountName: "Rent Expense",
    accountCategory: "Expense",
    normalBalance: "Debit",
  },
  {
    accountCode: "6300",
    accountName: "Utilities Expense",
    accountCategory: "Expense",
    normalBalance: "Debit",
  },
];

const generateEntryNumber = () =>
  `JE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const generateLedgerNumber = () =>
  `GL-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const ensureSystemAccounts = async () => {
  for (const account of SYSTEM_ACCOUNT_DEFINITIONS) {
    await ChartOfAccount.findOneAndUpdate(
      { accountCode: account.accountCode },
      {
        $setOnInsert: {
          ...account,
          currentBalance: 0,
          status: "Active",
          isSystemAccount: true,
        },
      },
      { upsert: true, new: true }
    );
  }
};

const validateJournalLines = (lines) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Journal entry lines are required.");
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    const debit = roundMoney(line.debit);
    const credit = roundMoney(line.credit);

    if (!line.accountCode) {
      throw new Error("Each journal line must include an accountCode.");
    }

    if (debit < 0 || credit < 0) {
      throw new Error("Journal line debit/credit values cannot be negative.");
    }

    if (debit > 0 && credit > 0) {
      throw new Error("A journal line cannot have both debit and credit.");
    }

    if (debit === 0 && credit === 0) {
      throw new Error("A journal line must have either debit or credit.");
    }

    totalDebit += debit;
    totalCredit += credit;
  }

  totalDebit = roundMoney(totalDebit);
  totalCredit = roundMoney(totalCredit);

  if (totalDebit !== totalCredit) {
    throw new Error(
      `Journal entry is not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`
    );
  }

  return { totalDebit, totalCredit };
};

const calculateUpdatedBalance = ({ currentBalance, normalBalance, debit, credit }) => {
  let updatedBalance = Number(currentBalance || 0);

  if (normalBalance === "Debit") {
    updatedBalance += Number(debit || 0);
    updatedBalance -= Number(credit || 0);
  } else {
    updatedBalance -= Number(debit || 0);
    updatedBalance += Number(credit || 0);
  }

  return roundMoney(updatedBalance);
};

const postJournalEntry = async ({
  entryDate,
  memo,
  reference,
  sourceModule,
  createdBy,
  lines = [],
}) => {
  const { totalDebit, totalCredit } = validateJournalLines(lines);

  const session = await mongoose.startSession();

  try {
    let createdEntry = null;

    await session.withTransaction(async () => {
      const entryNumber = generateEntryNumber();
      const preparedLines = [];

      for (const line of lines) {
        const account = await ChartOfAccount.findOne({
          accountCode: line.accountCode,
        }).session(session);

        if (!account) {
          throw new Error(`Chart account ${line.accountCode} not found.`);
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
      }
    });

    return createdEntry;
  } finally {
    session.endSession();
  }
};

module.exports = {
  postJournalEntry,
  ensureSystemAccounts,
  SYSTEM_ACCOUNTS,
};