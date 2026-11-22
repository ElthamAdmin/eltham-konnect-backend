const ChartOfAccount = require("../models/ChartOfAccount");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calculateBaseCurrencyAmount = ({
  amount,
  currency,
  exchangeRate,
}) => {
  const numericAmount = roundMoney(amount);

  const normalizedCurrency = String(
    currency || "JMD"
  ).toUpperCase();

  if (normalizedCurrency === "JMD") {
    return numericAmount;
  }

  return roundMoney(
    numericAmount * Number(exchangeRate || 1)
  );
};

const syncFinancialAccountFromLedger = async (
  account,
  session = null
) => {

    const linkedChartAccount = await ChartOfAccount.findOne({
    accountCode: account.linkedChartAccountCode,
  }).session(session);

  if (!linkedChartAccount) return account;

  account.currentBalance = roundMoney(linkedChartAccount.currentBalance || 0);
  account.baseCurrencyBalance = calculateBaseCurrencyAmount({
    amount: account.currentBalance,
    currency: account.currency,
    exchangeRate: account.exchangeRate,
  });

  await account.save(session ? { session } : {});
    return account;
};

module.exports = { syncFinancialAccountFromLedger };