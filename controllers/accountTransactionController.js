const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");

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
    const {
      accountNumber,
      transactionType,
      amount,
      reference,
      notes,
    } = req.body;

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

    const numericAmount = Number(amount);

    if (numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than zero",
      });
    }

    const increaseTypes = ["Deposit", "Transfer In", "Invoice Payment"];
    const decreaseTypes = ["Withdrawal", "Transfer Out", "Expense Payment", "Credit Card Payment"];

    if (increaseTypes.includes(transactionType)) {
      account.currentBalance += numericAmount;
    } else if (decreaseTypes.includes(transactionType)) {
      if (account.currentBalance < numericAmount) {
        return res.status(400).json({
          success: false,
          message: "Insufficient balance in selected account",
        });
      }
      account.currentBalance -= numericAmount;
    }

    await account.save();

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
    const {
      fromAccountNumber,
      toAccountNumber,
      amount,
      reference,
      notes,
    } = req.body;

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

    const numericAmount = Number(amount);

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

    if (fromAccount.currentBalance < numericAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance in source account",
      });
    }

    fromAccount.currentBalance -= numericAmount;
    toAccount.currentBalance += numericAmount;

    await fromAccount.save();
    await toAccount.save();

    const transferRef = reference || `Transfer ${fromAccount.accountName} → ${toAccount.accountName}`;

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

    res.status(201).json({
      success: true,
      message: "Transfer completed successfully",
      data: { transferOut, transferIn },
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