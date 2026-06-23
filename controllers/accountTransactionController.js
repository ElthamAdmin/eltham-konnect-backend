const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const ChartOfAccount = require("../models/ChartOfAccount");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const syncChartAccount = async (account) => {
  if (!account.linkedChartAccountCode) return;

  await ChartOfAccount.findOneAndUpdate(
    { accountCode: account.linkedChartAccountCode },
    { $set: { currentBalance: account.currentBalance } }
  );
};

const getTransactions = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;

    const total = await AccountTransaction.countDocuments();

    const transactions = await AccountTransaction.find()
      .sort({ transactionDate: -1, _id: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      message: "Account transactions retrieved successfully",
      totalTransactions: total,
      data: transactions,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("Error getting account transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve account transactions",
      error: error.message,
    });
  }
};

const createTransaction = async (req, res) => {
  try {
    const { accountNumber, transactionType, amount, reference, notes } = req.body;

    if (!accountNumber || !transactionType || !amount) {
      return res.status(400).json({
        success: false,
        message: "Account, transaction type, and amount are required",
      });
    }

    const account = await FinancialAccount.findOne({ accountNumber });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Financial account not found",
      });
    }

    const numericAmount = roundMoney(amount);
    const normalizedType = String(transactionType).trim();

    if (numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than zero",
      });
    }

    if (
      normalizedType === "Withdrawal" &&
      roundMoney(account.currentBalance) < numericAmount
    ) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance in account",
      });
    }

    const transaction = await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}`,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      transactionType: normalizedType,
      amount: numericAmount,
      reference: reference || "",
      notes: notes || "",
      transactionDate: new Date(),
    });

    if (normalizedType === "Deposit") {
      account.currentBalance = roundMoney(account.currentBalance + numericAmount);
    }

    if (normalizedType === "Withdrawal") {
      account.currentBalance = roundMoney(account.currentBalance - numericAmount);
    }

    account.baseCurrencyBalance = account.currentBalance;

    await account.save();
    await syncChartAccount(account);

    res.status(201).json({
      success: true,
      message: "Account transaction recorded successfully",
      data: transaction,
      updatedAccount: account,
    });
  } catch (error) {
    console.error("Error creating account transaction:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create account transaction",
      error: error.message,
    });
  }
};

const createTransfer = async (req, res) => {
  try {
    const { fromAccountNumber, toAccountNumber, amount, reference, notes } = req.body;

    if (!fromAccountNumber || !toAccountNumber || !amount) {
      return res.status(400).json({
        success: false,
        message: "From account, to account, and amount are required",
      });
    }

    if (fromAccountNumber === toAccountNumber) {
      return res.status(400).json({
        success: false,
        message: "Source and destination accounts must be different",
      });
    }

    const numericAmount = roundMoney(amount);

    if (numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Transfer amount must be greater than zero",
      });
    }

    const fromAccount = await FinancialAccount.findOne({
      accountNumber: fromAccountNumber,
    });

    const toAccount = await FinancialAccount.findOne({
      accountNumber: toAccountNumber,
    });

    if (!fromAccount || !toAccount) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    if (roundMoney(fromAccount.currentBalance) < numericAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance in source account",
      });
    }

    const transferRef =
      reference || `Transfer ${fromAccount.accountName} → ${toAccount.accountName}`;

    const transferOut = await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}-OUT`,
      accountNumber: fromAccount.accountNumber,
      accountName: fromAccount.accountName,
      transactionType: "Transfer Out",
      amount: numericAmount,
      reference: transferRef,
      notes: notes || "",
      transactionDate: new Date(),
    });

    const transferIn = await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}-IN`,
      accountNumber: toAccount.accountNumber,
      accountName: toAccount.accountName,
      transactionType: "Transfer In",
      amount: numericAmount,
      reference: transferRef,
      notes: notes || "",
      transactionDate: new Date(),
    });

    fromAccount.currentBalance = roundMoney(fromAccount.currentBalance - numericAmount);

    if (toAccount.accountType === "Credit Card") {
      toAccount.currentBalance = roundMoney(toAccount.currentBalance - numericAmount);
    } else {
      toAccount.currentBalance = roundMoney(toAccount.currentBalance + numericAmount);
    }

    fromAccount.baseCurrencyBalance = fromAccount.currentBalance;
    toAccount.baseCurrencyBalance = toAccount.currentBalance;

    await fromAccount.save();
    await toAccount.save();

    await syncChartAccount(fromAccount);
    await syncChartAccount(toAccount);

    res.status(201).json({
      success: true,
      message: "Transfer completed successfully",
      data: { transferOut, transferIn },
      updatedAccounts: {
        fromAccount,
        toAccount,
      },
    });
  } catch (error) {
    console.error("Error creating transfer:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete transfer",
      error: error.message,
    });
  }
};

module.exports = {
  getTransactions,
  createTransaction,
  createTransfer,
};