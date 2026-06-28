const ChartOfAccount = require("../../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../../models/GeneralLedgerTransaction");
const { roundMoney } = require("./money");

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

const getAccountNaturalBalance = ({ normalBalance, debitTotal, creditTotal }) => {
  const debit = roundMoney(debitTotal);
  const credit = roundMoney(creditTotal);

  if (normalBalance === "Debit") {
    return roundMoney(debit - credit);
  }

  return roundMoney(credit - debit);
};

const buildTrialBalance = async ({ from = "", to = "" } = {}) => {
  const { startDate, endDate } = buildDateRange({ from, to });

  const accounts = await ChartOfAccount.find({ status: "Active" }).sort({
    accountCode: 1,
  });

  const ledger = await GeneralLedgerTransaction.find().sort({
    accountCode: 1,
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

  const rows = accounts.map((account) => {
    const accountLedger = filteredLedger.filter(
      (line) => line.accountCode === account.accountCode
    );

    const debitTotal = roundMoney(
      accountLedger.reduce((sum, line) => sum + Number(line.debit || 0), 0)
    );

    const creditTotal = roundMoney(
      accountLedger.reduce((sum, line) => sum + Number(line.credit || 0), 0)
    );

    const naturalBalance = getAccountNaturalBalance({
      normalBalance: account.normalBalance,
      debitTotal,
      creditTotal,
    });

    let trialDebit = 0;
    let trialCredit = 0;

    if (naturalBalance > 0) {
      if (account.normalBalance === "Debit") {
        trialDebit = naturalBalance;
      } else {
        trialCredit = naturalBalance;
      }
    }

    if (naturalBalance < 0) {
      if (account.normalBalance === "Debit") {
        trialCredit = Math.abs(naturalBalance);
      } else {
        trialDebit = Math.abs(naturalBalance);
      }
    }

    return {
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountCategory: account.accountCategory,
      accountType: account.accountType || "",
      normalBalance: account.normalBalance,
      debitTotal,
      creditTotal,
      naturalBalance,
      trialDebit: roundMoney(trialDebit),
      trialCredit: roundMoney(trialCredit),
    };
  });

  const totalDebits = roundMoney(
    rows.reduce((sum, row) => sum + Number(row.trialDebit || 0), 0)
  );

  const totalCredits = roundMoney(
    rows.reduce((sum, row) => sum + Number(row.trialCredit || 0), 0)
  );

  const difference = roundMoney(totalDebits - totalCredits);

  return {
    filters: { from, to, startDate, endDate },
    rows,
    totals: {
      totalDebits,
      totalCredits,
      difference,
      isBalanced: difference === 0,
    },
    diagnostics: {
      accountCount: accounts.length,
      ledgerLineCount: filteredLedger.length,
      outOfBalance: difference !== 0,
    },
  };
};

module.exports = {
  buildTrialBalance,
};