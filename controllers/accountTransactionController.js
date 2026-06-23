const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const ChartOfAccount = require("../models/ChartOfAccount");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

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

    if (numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than zero",
      });
    }

    if (
      transactionType === "Withdrawal" &&
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
      transactionType,
      amount: numericAmount,
      reference: reference || "",
      notes: notes || "",
      transactionDate: new Date(),
    });

    if (transactionType === "Deposit") {
      account.currentBalance = roundMoney(account.currentBalance + numericAmount);
    }

    if (transactionType === "Withdrawal") {
      account.currentBalance = roundMoney(account.currentBalance - numericAmount);
    }

    account.baseCurrencyBalance = account.currentBalance;

    await account.save();

    await ChartOfAccount.findOneAndUpdate(
      { accountCode: account.linkedChartAccountCode },
      { $set: { currentBalance: account.currentBalance } }
    );

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

module.exports = {
  getTransactions,
  createTransaction,
  createTransfer,
};