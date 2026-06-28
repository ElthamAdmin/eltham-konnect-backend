const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const ChartOfAccount = require("../models/ChartOfAccount");

const {
  postJournalEntry,
  SYSTEM_ACCOUNTS,
} = require("../utils/generalLedgerPoster");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getBaseCurrencyBalance = (account) => {
  const amount = roundMoney(account.currentBalance || 0);
  const currency = String(account.currency || "JMD").toUpperCase();

  if (currency === "JMD") return amount;

  return roundMoney(amount * Number(account.exchangeRate || 1));
};

const syncFinancialAccountFromChart = async (account) => {
  if (!account || !account.linkedChartAccountCode) return account;

  const chartAccount = await ChartOfAccount.findOne({
    accountCode: account.linkedChartAccountCode,
  });

  if (!chartAccount) return account;

  account.currentBalance = roundMoney(chartAccount.currentBalance || 0);
  account.baseCurrencyBalance = getBaseCurrencyBalance(account);

  await account.save();
  return account;
};

const requireLinkedChartAccount = (account) => {
  if (!account.linkedChartAccountCode) {
    throw new Error(
      `${account.accountName} is not linked to a Chart of Accounts code.`
    );
  }
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
    const {
      accountNumber,
      transactionType,
      amount,
      reference,
      notes,
      transactionDate,
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

    requireLinkedChartAccount(account);

    const numericAmount = roundMoney(amount);
    const normalizedType = String(transactionType).trim();
    const postingDate =
      transactionDate || new Date().toISOString().slice(0, 10);

    if (numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than zero",
      });
    }

    const allowedTypes = [
      "Deposit",
      "Owner Deposit",
      "Withdrawal",
      "Owner Drawing",
    ];

    if (!allowedTypes.includes(normalizedType)) {
      return res.status(400).json({
        success: false,
        message:
          "Only Deposit, Owner Deposit, Withdrawal, and Owner Drawing are allowed here. Use transfer endpoint for transfers.",
      });
    }

    if (
      ["Withdrawal", "Owner Drawing"].includes(normalizedType) &&
      account.accountType !== "Credit Card" &&
      roundMoney(account.currentBalance || 0) < numericAmount
    ) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance in account",
      });
    }

    let debitAccountCode = "";
    let creditAccountCode = "";
    let memo = "";

    if (normalizedType === "Deposit" || normalizedType === "Owner Deposit") {
      debitAccountCode = account.linkedChartAccountCode;
      creditAccountCode = SYSTEM_ACCOUNTS.OWNER_EQUITY;
      memo = `${normalizedType} into ${account.accountName}`;
    }

    if (normalizedType === "Withdrawal" || normalizedType === "Owner Drawing") {
      debitAccountCode = SYSTEM_ACCOUNTS.OWNER_DRAWINGS;
      creditAccountCode = account.linkedChartAccountCode;
      memo = `${normalizedType} from ${account.accountName}`;
    }

    const journalEntry = await postJournalEntry({
      entryDate: postingDate,
      memo,
      reference: reference || normalizedType,
      sourceModule: "Account Transactions",
      createdBy: req.user?.fullName || "System User",
      lines: [
        {
          accountCode: debitAccountCode,
          debit: numericAmount,
          credit: 0,
          description: notes || memo,
        },
        {
          accountCode: creditAccountCode,
          debit: 0,
          credit: numericAmount,
          description: notes || memo,
        },
      ],
    });

    const transaction = await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}`,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      linkedChartAccountCode: account.linkedChartAccountCode,
      journalEntryNumber: journalEntry.entryNumber,
      ledgerReference: journalEntry.entryNumber,
      transactionType: normalizedType,
      amount: numericAmount,
      reference: reference || "",
      notes: notes || "",
      transactionDate: new Date(postingDate),
    });

    const updatedAccount = await syncFinancialAccountFromChart(account);

    res.status(201).json({
      success: true,
      message: "Account transaction posted successfully",
      data: transaction,
      updatedAccount,
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
      transactionDate,
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

    const numericAmount = roundMoney(amount);
    const postingDate =
      transactionDate || new Date().toISOString().slice(0, 10);

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

    requireLinkedChartAccount(fromAccount);
    requireLinkedChartAccount(toAccount);

    if (
      fromAccount.accountType !== "Credit Card" &&
      roundMoney(fromAccount.currentBalance || 0) < numericAmount
    ) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance in source account",
      });
    }

    const transferRef =
      reference || `Transfer ${fromAccount.accountName} → ${toAccount.accountName}`;

    const journalEntry = await postJournalEntry({
      entryDate: postingDate,
      memo: transferRef,
      reference: transferRef,
      sourceModule: "Account Transfers",
      createdBy: req.user?.fullName || "System User",
      lines: [
        {
          accountCode: toAccount.linkedChartAccountCode,
          debit: numericAmount,
          credit: 0,
          description: notes || transferRef,
        },
        {
          accountCode: fromAccount.linkedChartAccountCode,
          debit: 0,
          credit: numericAmount,
          description: notes || transferRef,
        },
      ],
    });

    const transferOut = await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}-OUT`,
      accountNumber: fromAccount.accountNumber,
      accountName: fromAccount.accountName,
      linkedChartAccountCode: fromAccount.linkedChartAccountCode,
      journalEntryNumber: journalEntry.entryNumber,
      ledgerReference: journalEntry.entryNumber,
      transactionType: "Transfer Out",
      amount: numericAmount,
      reference: transferRef,
      notes: notes || "",
      transactionDate: new Date(postingDate),
    });

    const transferIn = await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}-IN`,
      accountNumber: toAccount.accountNumber,
      accountName: toAccount.accountName,
      linkedChartAccountCode: toAccount.linkedChartAccountCode,
      journalEntryNumber: journalEntry.entryNumber,
      ledgerReference: journalEntry.entryNumber,
      transactionType: "Transfer In",
      amount: numericAmount,
      reference: transferRef,
      notes: notes || "",
      transactionDate: new Date(postingDate),
    });

    const updatedFromAccount = await syncFinancialAccountFromChart(fromAccount);
    const updatedToAccount = await syncFinancialAccountFromChart(toAccount);

    res.status(201).json({
      success: true,
      message: "Transfer posted successfully",
      data: { transferOut, transferIn },
      updatedAccounts: {
        fromAccount: updatedFromAccount,
        toAccount: updatedToAccount,
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