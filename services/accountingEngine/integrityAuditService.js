const ChartOfAccount = require("../../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../../models/GeneralLedgerTransaction");
const { buildTrialBalance } = require("./trialBalanceService");
const { roundMoney } = require("./money");

const calculateNaturalBalance = ({ normalBalance, debitTotal, creditTotal }) => {
  if (normalBalance === "Debit") {
    return roundMoney(debitTotal - creditTotal);
  }

  return roundMoney(creditTotal - debitTotal);
};

const auditTrialBalanceIntegrity = async ({ from = "", to = "" } = {}) => {
  const trialBalance = await buildTrialBalance({ from, to });

  const accounts = await ChartOfAccount.find({ status: "Active" }).sort({
    accountCode: 1,
  });

  const ledgerLines = await GeneralLedgerTransaction.find();

  const accountAudits = accounts.map((account) => {
    const accountLedger = ledgerLines.filter(
      (line) => line.accountCode === account.accountCode
    );

    const ledgerDebitTotal = roundMoney(
      accountLedger.reduce((sum, line) => sum + Number(line.debit || 0), 0)
    );

    const ledgerCreditTotal = roundMoney(
      accountLedger.reduce((sum, line) => sum + Number(line.credit || 0), 0)
    );

    const ledgerNaturalBalance = calculateNaturalBalance({
      normalBalance: account.normalBalance,
      debitTotal: ledgerDebitTotal,
      creditTotal: ledgerCreditTotal,
    });

    const trialRow = trialBalance.rows.find(
      (row) => row.accountCode === account.accountCode
    );

    const trialNaturalBalance = trialRow
      ? roundMoney(trialRow.naturalBalance || 0)
      : 0;

    const chartCurrentBalance = roundMoney(account.currentBalance || 0);

    const ledgerVsChartDifference = roundMoney(
      ledgerNaturalBalance - chartCurrentBalance
    );

    const ledgerVsTrialDifference = roundMoney(
      ledgerNaturalBalance - trialNaturalBalance
    );

    return {
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountCategory: account.accountCategory,
      normalBalance: account.normalBalance,

      ledgerDebitTotal,
      ledgerCreditTotal,
      ledgerNaturalBalance,

      chartCurrentBalance,
      trialNaturalBalance,

      ledgerVsChartDifference,
      ledgerVsTrialDifference,

      hasMismatch:
        ledgerVsChartDifference !== 0 || ledgerVsTrialDifference !== 0,
    };
  });

  const mismatches = accountAudits.filter((row) => row.hasMismatch);

  const ledgerTotalDebits = roundMoney(
    ledgerLines.reduce((sum, line) => sum + Number(line.debit || 0), 0)
  );

  const ledgerTotalCredits = roundMoney(
    ledgerLines.reduce((sum, line) => sum + Number(line.credit || 0), 0)
  );

  return {
    filters: trialBalance.filters,
    ledgerTotals: {
      debits: ledgerTotalDebits,
      credits: ledgerTotalCredits,
      difference: roundMoney(ledgerTotalDebits - ledgerTotalCredits),
      isBalanced: ledgerTotalDebits === ledgerTotalCredits,
    },
    trialBalanceTotals: trialBalance.totals,
    mismatchCount: mismatches.length,
    mismatches,
    accountAudits,
  };
};

module.exports = {
  auditTrialBalanceIntegrity,
};