const mongoose = require("mongoose");
const JournalEntry = require("../models/JournalEntry");
const ChartOfAccount = require("../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");
const AccountingPeriod = require("../models/AccountingPeriod");
const FinancialAccount = require("../models/FinancialAccount");

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
  OWNER_DRAWINGS: "3050",
  RETAINED_EARNINGS: "3100",
  SHIPPING_REVENUE: "4000",
  MARKETPLACE_REVENUE: "4010",
  DELIVERY_REVENUE: "4020",
  COST_OF_SALES: "5000",
  OPERATING_EXPENSE: "6000",
  PAYROLL_EXPENSE: "6100",
  RENT_EXPENSE: "6200",
  UTILITIES_EXPENSE: "6300",
  DELIVERY_EXPENSE: "6400",
  SUPPLIES_EXPENSE: "6500",
};

const SYSTEM_ACCOUNT_DEFINITIONS = [
  ["1000", "Cash on Hand", "Asset", "Debit"],
  ["1010", "NCB Bank", "Asset", "Debit"],
  ["1100", "Accounts Receivable", "Asset", "Debit"],
  ["1200", "Inventory", "Asset", "Debit"],
  ["2000", "Accounts Payable", "Liability", "Credit"],
  ["2100", "PAYE Payable", "Liability", "Credit"],
  ["2110", "NIS Payable", "Liability", "Credit"],
  ["2120", "NHT Payable", "Liability", "Credit"],
  ["2130", "Education Tax Payable", "Liability", "Credit"],
  ["2140", "Pension Payable", "Liability", "Credit"],
  ["3000", "Owner Equity", "Equity", "Credit"],
  ["3050", "Owner Drawings", "Equity", "Debit"],
  ["3100", "Retained Earnings", "Equity", "Credit"],
  ["4000", "Shipping Revenue", "Revenue", "Credit"],
  ["4010", "Marketplace Revenue", "Revenue", "Credit"],
  ["4020", "Delivery Revenue", "Revenue", "Credit"],
  ["5000", "Cost of Sales", "Cost of Sales", "Debit"],
  ["6000", "Operating Expense", "Expense", "Debit"],
  ["6100", "Payroll Expense", "Expense", "Debit"],
  ["6200", "Rent Expense", "Expense", "Debit"],
  ["6300", "Utilities Expense", "Expense", "Debit"],
  ["6400", "Delivery Expense", "Expense", "Debit"],
  ["6500", "Supplies Expense", "Expense", "Debit"],
].map(([accountCode, accountName, accountCategory, normalBalance]) => ({
  accountCode,
  accountName,
  accountCategory,
  normalBalance,
}));

const generateEntryNumber = () =>
  `JE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const generateLedgerNumber = () =>
  `GL-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const calculateBaseCurrencyAmount = ({ amount, currency, exchangeRate }) => {
  const numericAmount = roundMoney(amount);
  if (String(currency || "JMD").toUpperCase() === "JMD") return numericAmount;
  return roundMoney(numericAmount * Number(exchangeRate || 1));
};

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

const ensureSystemAccounts = async () => {
  for (const account of SYSTEM_ACCOUNT_DEFINITIONS) {
    await ChartOfAccount.findOneAndUpdate(
      { accountCode: account.accountCode },
      {
        $setOnInsert: {
          ...account,
          currentBalance: 0,
          openingBalance: 0,
          status: "Active",
          isSystemAccount: true,
        },
      },
      { upsert: true, new: true }
    );
  }
};

const validateJournalLines = (lines) => {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error("A journal entry must have at least two lines.");
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

const calculateUpdatedBalance = ({
  currentBalance,
  normalBalance,
  debit,
  credit,
}) => {
  if (normalBalance === "Debit") {
    return roundMoney(Number(currentBalance || 0) + Number(debit || 0) - Number(credit || 0));
  }

  return roundMoney(Number(currentBalance || 0) - Number(debit || 0) + Number(credit || 0));
};

const syncFinancialAccountsForChartAccount = async (accountCode, session = null) => {
  const query = FinancialAccount.find({ linkedChartAccountCode: accountCode });
  if (session) query.session(session);

  const financialAccounts = await query;

  for (const financialAccount of financialAccounts) {
    const chartAccountQuery = ChartOfAccount.findOne({ accountCode });
    if (session) chartAccountQuery.session(session);

    const chartAccount = await chartAccountQuery;
    if (!chartAccount) continue;

    financialAccount.currentBalance = roundMoney(chartAccount.currentBalance || 0);
    financialAccount.baseCurrencyBalance = calculateBaseCurrencyAmount({
      amount: financialAccount.currentBalance,
      currency: financialAccount.currency,
      exchangeRate: financialAccount.exchangeRate,
    });

    await financialAccount.save({ session });
  }
};

const rebuildAccountBalanceFromLedger = async (accountCode) => {
  const account = await ChartOfAccount.findOne({ accountCode });

  if (!account) {
    throw new Error(`Chart account ${accountCode} not found.`);
  }

  const ledgerLines = await GeneralLedgerTransaction.find({ accountCode }).sort({
    entryDate: 1,
    createdAt: 1,
    _id: 1,
  });

  let balance = 0;

  for (const line of ledgerLines) {
    balance = calculateUpdatedBalance({
      currentBalance: balance,
      normalBalance: account.normalBalance,
      debit: line.debit,
      credit: line.credit,
    });

    line.runningBalance = balance;
    await line.save();
  }

  account.currentBalance = roundMoney(balance);
  await account.save();

  await syncFinancialAccountsForChartAccount(accountCode);

  return account;
};

const rebuildAllAccountBalancesFromLedger = async () => {
  const accounts = await ChartOfAccount.find({ status: "Active" }).sort({
    accountCode: 1,
  });

  const rebuiltAccounts = [];

  for (const account of accounts) {
    const rebuilt = await rebuildAccountBalanceFromLedger(account.accountCode);
    rebuiltAccounts.push(rebuilt);
  }

  return rebuiltAccounts;
};

const postJournalEntry = async ({
  entryDate,
  memo = "",
  reference = "",
  sourceModule = "",
  createdBy = "System User",
  lines = [],
}) => {
  await ensureSystemAccounts();

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
  ensureSystemAccounts,
  rebuildAccountBalanceFromLedger,
  rebuildAllAccountBalancesFromLedger,
  syncFinancialAccountsForChartAccount,
  SYSTEM_ACCOUNTS,
};