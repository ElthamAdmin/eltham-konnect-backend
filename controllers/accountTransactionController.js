const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");

const getTransactions = async (req, res) => {
  try {
    const transactions = await AccountTransaction.find().sort({ transactionDate: -1 });

    res.json({
      success: true,
      message: "Account transactions retrieved successfully",
      totalTransactions: transactions.length,
      data: transactions,
    });
  } catch (error) {
    console.error("Error getting account transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve account transactions",
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

    if (!fromAccount) {
      return res.status(404).json({
        success: false,
        message: "Source account not found",
      });
    }

    if (!toAccount) {
      return res.status(404).json({
        success: false,
        message: "Destination account not found",
      });
    }

    if (Number(fromAccount.currentBalance || 0) < numericAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance in source account",
      });
    }

    fromAccount.currentBalance =
      Number(fromAccount.currentBalance || 0) - numericAmount;

    toAccount.currentBalance =
      Number(toAccount.currentBalance || 0) + numericAmount;

    await fromAccount.save();
    await toAccount.save();

    const transferReference =
      reference || `Transfer ${fromAccount.accountName} → ${toAccount.accountName}`;

    const transferOut = await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}-OUT`,
      accountNumber: fromAccount.accountNumber,
      accountName: fromAccount.accountName,
      transactionType: "Transfer Out",
      amount: numericAmount,
      reference: transferReference,
      notes: notes || `Transfer to ${toAccount.accountName}`,
      transactionDate: new Date(),
    });

    const transferIn = await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}-IN`,
      accountNumber: toAccount.accountNumber,
      accountName: toAccount.accountName,
      transactionType: "Transfer In",
      amount: numericAmount,
      reference: transferReference,
      notes: notes || `Transfer from ${fromAccount.accountName}`,
      transactionDate: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Transfer completed successfully",
      data: {
        fromAccount,
        toAccount,
        transferOut,
        transferIn,
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