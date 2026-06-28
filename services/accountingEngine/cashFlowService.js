const ChartOfAccount = require("../../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../../models/GeneralLedgerTransaction");
const { roundMoney } = require("./money");

const isCashLikeAccount = (account = {}) => {
  const name = String(account.accountName || "").toLowerCase();
  const type = String(account.accountType || "").toLowerCase();

  return (
    account.accountCategory === "Asset" &&
    (name.includes("cash") ||
      name.includes("bank") ||
      type.includes("bank") ||
      type.includes("cash"))
  );
};

const normalizeDateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildDateRange = ({ from = "", to = "" } = {}) => {
  let startDate = null;
  let endDate = null;

  if (from) {
    const parsed = new Date(from);
    if (!Number.isNaN(parsed.getTime())) startDate = parsed;
  }

  if (to) {
    const parsed = new Date(to);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setHours(23, 59, 59, 999);
      endDate = parsed;
    }
  }

  return { startDate, endDate };
};

const isWithinRange = (value, startDate, endDate) => {
  const date = normalizeDateValue(value);
  if (!date) return false;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
};

const buildCashFlow = async ({ from = "", to = "" } = {}) => {
  const { startDate, endDate } = buildDateRange({ from, to });

  const cashAccounts = await ChartOfAccount.find({ status: "Active" }).then(
    (accounts) => accounts.filter(isCashLikeAccount)
  );

  const cashAccountCodes = cashAccounts.map((account) => account.accountCode);

  const ledger = await GeneralLedgerTransaction.find({
    accountCode: { $in: cashAccountCodes },
  }).sort({
    entryDate: 1,
    createdAt: 1,
    _id: 1,
  });

  const filteredLedger =
    startDate || endDate
      ? ledger.filter((line) =>
          isWithinRange(line.entryDate || line.createdAt, startDate, endDate)
        )
      : ledger;

  const inflows = [];
  const outflows = [];

  filteredLedger.forEach((line) => {
    const debit = roundMoney(line.debit || 0);
    const credit = roundMoney(line.credit || 0);

    if (debit > 0) {
      inflows.push({
        entryDate: line.entryDate,
        accountCode: line.accountCode,
        accountName: line.accountName,
        sourceModule: line.sourceModule,
        reference: line.reference,
        description: line.description,
        amount: debit,
      });
    }

    if (credit > 0) {
      outflows.push({
        entryDate: line.entryDate,
        accountCode: line.accountCode,
        accountName: line.accountName,
        sourceModule: line.sourceModule,
        reference: line.reference,
        description: line.description,
        amount: credit,
      });
    }
  });

  const totalInflows = roundMoney(
    inflows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  const totalOutflows = roundMoney(
    outflows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  return {
    filters: { from, to, startDate, endDate },
    cashAccounts: cashAccounts.map((account) => ({
      accountCode: account.accountCode,
      accountName: account.accountName,
      currentBalance: roundMoney(account.currentBalance || 0),
    })),
    inflows,
    outflows,
    totals: {
      totalInflows,
      totalOutflows,
      netCashFlow: roundMoney(totalInflows - totalOutflows),
    },
    diagnostics: {
      cashAccountCount: cashAccounts.length,
      ledgerLineCount: filteredLedger.length,
    },
  };
};

module.exports = {
  buildCashFlow,
};