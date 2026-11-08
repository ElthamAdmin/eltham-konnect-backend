const mongoose = require("mongoose");
const FinancialAccount = require("../models/FinancialAccount");
const ChartOfAccount = require("../models/ChartOfAccount");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calculateBaseCurrencyAmount = ({ amount, currency, exchangeRate }) => {
  const numericAmount = roundMoney(amount);
  const normalizedCurrency = String(currency || "JMD").toUpperCase();

  if (normalizedCurrency === "JMD") {
    return numericAmount;
  }

  return roundMoney(numericAmount * Number(exchangeRate || 1));
};

const getAccountCategory = (accountType) => {
  if (accountType === "Credit Card") return "Liability";
  return "Asset";
};

const getNormalBalance = (accountType) => {
  if (accountType === "Credit Card") return "Credit";
  return "Debit";
};

const createLinkedChartAccount = async ({
  accountNumber,
  accountName,
  accountType,
  session,
}) => {
  const existing = await ChartOfAccount.findOne({
    accountCode: accountNumber,
  }).session(session);

  if (existing) {
    throw new Error(
      "Generated account code already exists. Please retry."
    );
  }

  const [account] = await ChartOfAccount.create(
    [
      {
        accountCode: accountNumber,
        accountName,
        accountCategory: getAccountCategory(accountType),
        accountType,
        openingBalance: 0,
        currentBalance: 0,
        normalBalance: getNormalBalance(accountType),
        description:
          `Linked financial account for ${accountName}`,
        isSystemAccount: false,
        allowManualEntries: false,
        status: "Active",
      },
    ],
    { session }
  );

  return account;
};

const createAccount = async (req, res) => {
  try {
    const {
      accountName,
      accountType,
      bankName,
      openingBalance,
      currency,
      exchangeRate,
      accountPurpose,
      financialInstitution,
      branchName,
      accountNickname,
      isDefaultDepositAccount,
      isDefaultExpenseAccount,
      isDefaultPayrollAccount,
      isDefaultCustomerReceiptAccount,
      isBusinessSavings,
      creditLimit,
      availableCredit,
      statementDate,
      paymentDueDate,
      minimumPayment,
      interestRate,
      lastStatementBalance,
    } = req.body;

    if (!accountName || !accountType) {
      return res.status(400).json({
        success: false,
        message: "Account name and account type are required",
      });
    }

    const requestedOpening = Number(openingBalance ?? 0);
    const requestedCurrent = Number(
      req.body.currentBalance ?? 0
    );

    if (
      !Number.isFinite(requestedOpening) ||
      requestedOpening !== 0 ||
      !Number.isFinite(requestedCurrent) ||
      requestedCurrent !== 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Create the account with zero balance. Opening balances require a separate reviewed journal.",
      });
    }

    const accountCurrency = String(
      currency || "JMD"
    ).toUpperCase();

    const accountExchangeRate =
      accountCurrency === "JMD"
        ? 1
        : Number(exchangeRate || 1);

    if (
      !Number.isFinite(accountExchangeRate) ||
      accountExchangeRate <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a positive exchange rate.",
      });
    }

    const accountNumber = `ACC-${Date.now()}`;

    const finalPurpose =
      accountPurpose ||
      (
        accountType === "Credit Card"
          ? "Credit Card"
          : accountCurrency !== "JMD"
            ? "Savings"
            : "Operating"
      );

    const account = await mongoose.connection.transaction(
      async (session) => {
        await createLinkedChartAccount({
          accountNumber,
          accountName,
          accountType,
          session,
        });

        const [createdAccount] = await FinancialAccount.create(
          [
            {
              accountNumber,
              accountName,
              accountType,
              linkedChartAccountCode: accountNumber,
              bankName,

              openingBalance: 0,
              currentBalance: 0,

              currency: accountCurrency,
              exchangeRate: accountExchangeRate,
              baseCurrency: "JMD",
              baseCurrencyOpeningBalance: 0,
              baseCurrencyBalance: 0,

              accountPurpose: finalPurpose,

              financialInstitution:
                financialInstitution || bankName || "",

              branchName: branchName || "",
              accountNickname: accountNickname || "",

              isDefaultDepositAccount:
                isDefaultDepositAccount === true,

              isDefaultExpenseAccount:
                isDefaultExpenseAccount === true,

              isDefaultPayrollAccount:
                isDefaultPayrollAccount === true,

              isDefaultCustomerReceiptAccount:
                isDefaultCustomerReceiptAccount === true,

              isBusinessSavings:
                isBusinessSavings === true ||
                finalPurpose === "Savings",

              creditLimit: roundMoney(creditLimit),
              availableCredit: roundMoney(availableCredit),
              statementDate: Number(statementDate || 0),
              paymentDueDate: Number(paymentDueDate || 0),
              minimumPayment: roundMoney(minimumPayment),
              interestRate: Number(interestRate || 0),
              lastStatementBalance:
                roundMoney(lastStatementBalance),
            },
          ],
          { session }
        );

        return createdAccount;
      }
    );

    return res.json({
      success: true,
      message:
        "Financial account created and linked at zero balance. Opening balances require a separate reviewed journal.",
      data: account,
    });
  } catch (error) {
    console.error("Create financial account error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not create account",
      error: error.message,
    });
  }
};

const getAccounts = async (req, res) => {
  try {
    const accounts = await FinancialAccount.find().sort({ createdAt: -1 });

    const linkedCodes = accounts
      .map((account) => account.linkedChartAccountCode)
      .filter(Boolean);

    const chartAccounts = await ChartOfAccount.find({
      accountCode: { $in: linkedCodes },
    });

    const chartMap = {};
    chartAccounts.forEach((account) => {
      chartMap[account.accountCode] = account;
    });

    const data = accounts.map((account) => {
      const plain = account.toObject();
      const linkedChartAccount = chartMap[plain.linkedChartAccountCode];

      const currency = String(plain.currency || "JMD").toUpperCase();
const ledgerBalance = roundMoney(linkedChartAccount?.currentBalance || 0);

const currentBalance =
  currency === "JMD"
    ? ledgerBalance
    : roundMoney(plain.currentBalance || 0);

const baseCurrencyBalance =
  currency === "JMD"
    ? currentBalance
    : ledgerBalance;

const outstandingBalance =
  plain.accountType === "Credit Card" ? baseCurrencyBalance : 0;

const creditLimit = roundMoney(plain.creditLimit || 0);

const calculatedAvailableCredit =
  plain.accountType === "Credit Card" && creditLimit > 0
    ? roundMoney(creditLimit - outstandingBalance)
    : roundMoney(plain.availableCredit || 0);

const creditUtilization =
  plain.accountType === "Credit Card" && creditLimit > 0
    ? roundMoney((outstandingBalance / creditLimit) * 100)
    : 0;

let accountHealth = "Healthy";

if (plain.status !== "Active") {
  accountHealth = "Inactive";
} else if (plain.reconciliationStatus === "Out of Balance") {
  accountHealth = "Needs Reconciliation";
} else if (
  plain.accountType === "Credit Card" &&
  creditLimit > 0 &&
  creditUtilization >= 90
) {
  accountHealth = "Near Limit";
} else if (
  plain.accountType === "Credit Card" &&
  creditLimit > 0 &&
  creditUtilization >= 75
) {
  accountHealth = "High Utilization";
}

return {
  ...plain,
  currentBalance,
  baseCurrencyBalance,
  linkedChartAccount,
  outstandingBalance,
  calculatedAvailableCredit,
  creditUtilization,
  accountHealth,
};
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not retrieve accounts",
      error: error.message,
    });
  }
};

const updateAccount = async (req, res) => {
  try {
    const { accountNumber } = req.params;
    const {
  accountName,
  accountType,
  bankName,
  status,
  currency,
  exchangeRate,
  currentBalance,
  accountPurpose,
  financialInstitution,
  branchName,
  accountNickname,
  isDefaultDepositAccount,
  isDefaultExpenseAccount,
  isDefaultPayrollAccount,
  isDefaultCustomerReceiptAccount,
  isBusinessSavings,
  creditLimit,
  availableCredit,
  statementDate,
  paymentDueDate,
  minimumPayment,
  interestRate,
  lastStatementBalance,
} = req.body;

    const account = await FinancialAccount.findOne({ accountNumber });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Financial account not found",
      });
    }

        if (
      (
        accountType !== undefined &&
        accountType !== account.accountType
      ) ||
      (
        currency !== undefined &&
        String(currency).trim().toUpperCase() !==
          String(account.currency || "JMD").toUpperCase()
      )
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Changing account type or currency requires a separate reviewed conversion. Other account settings can still be edited.",
      });
    }

    if (accountName !== undefined) account.accountName = accountName;
    if (accountType !== undefined) account.accountType = accountType;
    if (bankName !== undefined) account.bankName = bankName;
        if (status !== undefined) account.status = status;
    if (currency !== undefined) account.currency = String(currency || "JMD").toUpperCase();
    if (exchangeRate !== undefined) account.exchangeRate = Number(exchangeRate || 1);

    if (accountPurpose !== undefined) account.accountPurpose = accountPurpose;
    if (financialInstitution !== undefined) account.financialInstitution = financialInstitution;
    if (branchName !== undefined) account.branchName = branchName;
    if (accountNickname !== undefined) account.accountNickname = accountNickname;

    if (isDefaultDepositAccount !== undefined) {
      account.isDefaultDepositAccount = isDefaultDepositAccount === true;
    }

    if (isDefaultExpenseAccount !== undefined) {
      account.isDefaultExpenseAccount = isDefaultExpenseAccount === true;
    }

    if (isDefaultPayrollAccount !== undefined) {
      account.isDefaultPayrollAccount = isDefaultPayrollAccount === true;
    }

    if (isDefaultCustomerReceiptAccount !== undefined) {
      account.isDefaultCustomerReceiptAccount =
        isDefaultCustomerReceiptAccount === true;
    }

    if (isBusinessSavings !== undefined) {
      account.isBusinessSavings = isBusinessSavings === true;
    }

    if (creditLimit !== undefined) account.creditLimit = roundMoney(creditLimit);
    if (availableCredit !== undefined) account.availableCredit = roundMoney(availableCredit);
    if (statementDate !== undefined) account.statementDate = Number(statementDate || 0);
    if (paymentDueDate !== undefined) account.paymentDueDate = Number(paymentDueDate || 0);
    if (minimumPayment !== undefined) account.minimumPayment = roundMoney(minimumPayment);
    if (interestRate !== undefined) account.interestRate = Number(interestRate || 0);
    if (lastStatementBalance !== undefined) {
      account.lastStatementBalance = roundMoney(lastStatementBalance);
    }

    if (!account.linkedChartAccountCode) {
      return res.status(409).json({
        success: false,
        message:
          "This account has no chart link and requires review before editing.",
      });
    }

    const linkedChartAccount = await ChartOfAccount.findOne({
      accountCode: account.linkedChartAccountCode,
    });

    if (!linkedChartAccount) {
      return res.status(409).json({
        success: false,
        message:
          "The linked chart account is missing. Review the account before editing.",
      });
    }

    await account.save();

    await ChartOfAccount.findOneAndUpdate(
      { accountCode: account.linkedChartAccountCode },
      {
        accountName: account.accountName,
        accountCategory: getAccountCategory(account.accountType),
        accountType: account.accountType,
        normalBalance: getNormalBalance(account.accountType),
        status: account.status,
      }
    );

    res.json({
      success: true,
      message: "Financial account updated successfully",
      data: account,
    });
  } catch (error) {
    console.error("Update account error:", error);
    res.status(500).json({
      success: false,
      message: "Could not update account",
      error: error.message,
    });
  }
};

module.exports = {
  createAccount,
  getAccounts,
  updateAccount,
};