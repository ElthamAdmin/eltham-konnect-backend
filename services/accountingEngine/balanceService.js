const ChartOfAccount = require("../../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../../models/GeneralLedgerTransaction");
const FinancialAccount = require("../../models/FinancialAccount");
const { roundMoney } = require("./money");

const calculateUpdatedBalance = ({
  currentBalance,
  normalBalance,
  debit,
  credit,
}) => {
  if (normalBalance === "Debit") {
    return roundMoney(
      Number(currentBalance || 0) + Number(debit || 0) - Number(credit || 0)
    );
  }

  return roundMoney(
    Number(currentBalance || 0) - Number(debit || 0) + Number(credit || 0)
  );
};

const calculateBaseCurrencyAmount = ({ amount, currency, exchangeRate }) => {
  const numericAmount = roundMoney(amount);

  if (String(currency || "JMD").toUpperCase() === "JMD") {
    return numericAmount;
  }

  return roundMoney(numericAmount * Number(exchangeRate || 1));
};

const syncFinancialAccountsForChartAccount = async (accountCode, session = null) => {
  const query = FinancialAccount.find({ linkedChartAccountCode: accountCode });
  if (session) query.session(session);

  const financialAccounts = await query;

  const chartQuery = ChartOfAccount.findOne({ accountCode });
  if (session) chartQuery.session(session);

  const chartAccount = await chartQuery;
  if (!chartAccount) return [];

  const updatedAccounts = [];

  for (const account of financialAccounts) {
    account.currentBalance = roundMoney(chartAccount.currentBalance || 0);
    account.baseCurrencyBalance = calculateBaseCurrencyAmount({
      amount: account.currentBalance,
      currency: account.currency,
      exchangeRate: account.exchangeRate,
    });

    await account.save({ session });
    updatedAccounts.push(account);
  }

  return updatedAccounts;
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
    rebuiltAccounts.push(await rebuildAccountBalanceFromLedger(account.accountCode));
  }

  return rebuiltAccounts;
};

module.exports = {
  calculateUpdatedBalance,
  calculateBaseCurrencyAmount,
  syncFinancialAccountsForChartAccount,
  rebuildAccountBalanceFromLedger,
  rebuildAllAccountBalancesFromLedger,
};