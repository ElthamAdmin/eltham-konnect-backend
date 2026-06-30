const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const BankReconciliation = require("../models/BankReconciliation");
const ChartOfAccount = require("../models/ChartOfAccount");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const todayYMD = () => new Date().toISOString().slice(0, 10);

const generateReconciliationNumber = () =>
  `REC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const isDepositTransaction = (transactionType = "") =>
  [
    "Deposit",
    "Owner Deposit",
    "Transfer In",
    "Invoice Payment",
    "Interest Income",
  ].includes(transactionType);

const getTransactionDirection = (transactionType = "") =>
  isDepositTransaction(transactionType) ? "Deposit" : "Withdrawal";

const buildAccountLedgerMap = async (accounts) => {
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

  return chartMap;
};

const getAccountsWithLedgerBalances = async () => {
  const accounts = await FinancialAccount.find().sort({ accountName: 1 });
  const chartMap = await buildAccountLedgerMap(accounts);

  return accounts.map((account) => {
    const plain = account.toObject();
    const linkedChartAccount = chartMap[plain.linkedChartAccountCode];

    return {
      ...plain,
      currentBalance: roundMoney(
        linkedChartAccount?.currentBalance ?? plain.currentBalance ?? 0
      ),
      baseCurrencyBalance: roundMoney(
        linkedChartAccount?.currentBalance ?? plain.baseCurrencyBalance ?? 0
      ),
      linkedChartAccount,
    };
  });
};

const calculateReconciliationTotals = ({
  transactions = [],
  clearedTransactionNumbers = [],
  statementOpeningBalance = 0,
  bankStatementBalance = 0,
}) => {
  const clearedSet = new Set(clearedTransactionNumbers);

  let clearedDeposits = 0;
  let clearedWithdrawals = 0;
  let outstandingDeposits = 0;
  let outstandingWithdrawals = 0;
  let reconciledTransactionCount = 0;
  let unreconciledTransactionCount = 0;

  const reconciliationItems = transactions.map((transaction) => {
    const amount = roundMoney(transaction.amount || 0);
    const direction = getTransactionDirection(transaction.transactionType);
    const cleared = clearedSet.has(transaction.transactionNumber);

    if (cleared) {
      reconciledTransactionCount += 1;

      if (direction === "Deposit") {
        clearedDeposits = roundMoney(clearedDeposits + amount);
      } else {
        clearedWithdrawals = roundMoney(clearedWithdrawals + amount);
      }
    } else {
      unreconciledTransactionCount += 1;

      if (direction === "Deposit") {
        outstandingDeposits = roundMoney(outstandingDeposits + amount);
      } else {
        outstandingWithdrawals = roundMoney(outstandingWithdrawals + amount);
      }
    }

    return {
      transactionNumber: transaction.transactionNumber,
      transactionType: transaction.transactionType,
      transactionDirection: direction,
      amount,
      transactionDate: transaction.transactionDate,
      reference: transaction.reference,
      notes: transaction.notes,
      cleared,
      clearedDate: cleared ? todayYMD() : "",
      reconciled: cleared,
    };
  });

  const adjustedBalance = roundMoney(
    Number(statementOpeningBalance || 0) + clearedDeposits - clearedWithdrawals
  );

  const difference = roundMoney(Number(bankStatementBalance || 0) - adjustedBalance);

  return {
    reconciliationItems,
    clearedDeposits,
    clearedWithdrawals,
    outstandingDeposits,
    outstandingWithdrawals,
    adjustedBalance,
    difference,
    reconciledTransactionCount,
    unreconciledTransactionCount,
  };
};

const getBankingDashboard = async (req, res) => {
  try {
    const accountsWithLedgerBalances = await getAccountsWithLedgerBalances();

    const transactions = await AccountTransaction.find().sort({
      transactionDate: -1,
      createdAt: -1,
    });

    const reconciliations = await BankReconciliation.find().sort({
      createdAt: -1,
    });

    const totalCash = accountsWithLedgerBalances.reduce(
      (sum, account) => sum + Number(account.currentBalance || 0),
      0
    );

    const unreconciledTransactions = transactions.filter(
      (transaction) => !transaction.reconciled
    );

    res.json({
      success: true,
      totalCash: roundMoney(totalCash),
      unreconciledCount: unreconciledTransactions.length,
      accounts: accountsWithLedgerBalances,
      transactions,
      reconciliations,
    });
  } catch (error) {
    console.error("Banking dashboard error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load banking dashboard",
      error: error.message,
    });
  }
};

const getBankRegister = async (req, res) => {
  try {
    const { accountNumber } = req.params;

    const account = await FinancialAccount.findOne({ accountNumber });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Financial account not found",
      });
    }

    const transactions = await AccountTransaction.find({ accountNumber }).sort({
      transactionDate: -1,
      createdAt: -1,
    });

    res.json({
      success: true,
      account,
      transactions,
    });
  } catch (error) {
    console.error("Bank register error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load bank register",
      error: error.message,
    });
  }
};

const getReconciliations = async (req, res) => {
  try {
    const reconciliations = await BankReconciliation.find().sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: reconciliations,
    });
  } catch (error) {
    console.error("Reconciliation list error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load reconciliations",
      error: error.message,
    });
  }
};

const getReconciliationByNumber = async (req, res) => {
  try {
    const { reconciliationNumber } = req.params;

    const reconciliation = await BankReconciliation.findOne({
      reconciliationNumber,
    });

    if (!reconciliation) {
      return res.status(404).json({
        success: false,
        message: "Reconciliation not found",
      });
    }

    res.json({
      success: true,
      data: reconciliation,
    });
  } catch (error) {
    console.error("Reconciliation detail error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load reconciliation",
      error: error.message,
    });
  }
};

const createBankReconciliation = async (req, res) => {
  try {
    const {
      accountNumber,
      statementStartDate,
      statementDate,
      statementOpeningBalance,
      bankStatementBalance,
      clearedTransactionNumbers = [],
      notes,
    } = req.body;

    if (!accountNumber || !statementDate) {
      return res.status(400).json({
        success: false,
        message: "Account number and statement date are required",
      });
    }

    const account = await FinancialAccount.findOne({
      accountNumber,
      status: "Active",
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Active financial account not found",
      });
    }

    const transactions = await AccountTransaction.find({
      accountNumber,
      lockedByReconciliation: { $ne: true },
      transactionDate: { $lte: new Date(statementDate) },
    }).sort({
      transactionDate: 1,
      createdAt: 1,
    });

    const chartAccount = account.linkedChartAccountCode
      ? await ChartOfAccount.findOne({
          accountCode: account.linkedChartAccountCode,
        })
      : null;

    const systemBalance = roundMoney(
      chartAccount?.currentBalance ?? account.currentBalance ?? 0
    );

    const totals = calculateReconciliationTotals({
      transactions,
      clearedTransactionNumbers,
      statementOpeningBalance,
      bankStatementBalance,
    });

    const status = totals.difference === 0 ? "Balanced" : "Out of Balance";

    const reconciliation = await BankReconciliation.create({
      reconciliationNumber: generateReconciliationNumber(),
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      statementStartDate: statementStartDate || "",
      statementDate,
      statementOpeningBalance: roundMoney(statementOpeningBalance || 0),
      bankStatementBalance: roundMoney(bankStatementBalance || 0),
      systemBalance,
      clearedDeposits: totals.clearedDeposits,
      clearedWithdrawals: totals.clearedWithdrawals,
      outstandingDeposits: totals.outstandingDeposits,
      outstandingWithdrawals: totals.outstandingWithdrawals,
      adjustedBalance: totals.adjustedBalance,
      difference: totals.difference,
      reconciledTransactionCount: totals.reconciledTransactionCount,
      unreconciledTransactionCount: totals.unreconciledTransactionCount,
      status,
      locked: false,
      notes,
      reconciliationItems: totals.reconciliationItems,
      startedBy: getUserName(req.user),
      completedBy: status === "Balanced" ? getUserName(req.user) : "",
    });

    account.outstandingDeposits = totals.outstandingDeposits;
    account.outstandingWithdrawals = totals.outstandingWithdrawals;
    account.unreconciledDifference = totals.difference;
    account.reconciliationStatus = status;
    await account.save();

    res.status(201).json({
      success: true,
      message: "Bank reconciliation created successfully",
      data: reconciliation,
    });
  } catch (error) {
    console.error("Bank reconciliation error:", error);

    res.status(500).json({
      success: false,
      message: "Could not create reconciliation",
      error: error.message,
    });
  }
};

const finalizeBankReconciliation = async (req, res) => {
  try {
    const { reconciliationNumber } = req.params;

    const reconciliation = await BankReconciliation.findOne({
      reconciliationNumber,
    });

    if (!reconciliation) {
      return res.status(404).json({
        success: false,
        message: "Reconciliation not found",
      });
    }

    if (reconciliation.locked || reconciliation.status === "Finalized") {
      return res.status(400).json({
        success: false,
        message: "This reconciliation is already finalized",
      });
    }

    if (roundMoney(reconciliation.difference) !== 0) {
      return res.status(400).json({
        success: false,
        message: "Only balanced reconciliations can be finalized",
      });
    }

    const clearedItems = reconciliation.reconciliationItems.filter(
      (item) => item.cleared
    );

    const clearedTransactionNumbers = clearedItems.map(
      (item) => item.transactionNumber
    );

    await AccountTransaction.updateMany(
      {
        transactionNumber: { $in: clearedTransactionNumbers },
      },
      {
        $set: {
          cleared: true,
          reconciled: true,
          clearedDate: reconciliation.statementDate,
          reconciliationNumber: reconciliation.reconciliationNumber,
          reconciliationDate: reconciliation.statementDate,
          statementDate: reconciliation.statementDate,
          reconciledBy: getUserName(req.user),
          lockedByReconciliation: true,
        },
      }
    );

    reconciliation.status = "Finalized";
    reconciliation.locked = true;
    reconciliation.finalizedBy = getUserName(req.user);
    reconciliation.finalizedAt = new Date();
    reconciliation.completedBy = getUserName(req.user);
    await reconciliation.save();

    const account = await FinancialAccount.findOne({
      accountNumber: reconciliation.accountNumber,
    });

    if (account) {
      account.lastReconciliationNumber = reconciliation.reconciliationNumber;
      account.lastReconciledDate = reconciliation.statementDate;
      account.lastReconciledBalance = reconciliation.bankStatementBalance;
      account.outstandingDeposits = reconciliation.outstandingDeposits;
      account.outstandingWithdrawals = reconciliation.outstandingWithdrawals;
      account.unreconciledDifference = 0;
      account.reconciliationStatus = "Balanced";
      await account.save();
    }

    res.json({
      success: true,
      message: "Bank reconciliation finalized successfully",
      data: reconciliation,
    });
  } catch (error) {
    console.error("Finalize reconciliation error:", error);

    res.status(500).json({
      success: false,
      message: "Could not finalize reconciliation",
      error: error.message,
    });
  }
};

const reopenBankReconciliation = async (req, res) => {
  try {
    const { reconciliationNumber } = req.params;

    const reconciliation = await BankReconciliation.findOne({
      reconciliationNumber,
    });

    if (!reconciliation) {
      return res.status(404).json({
        success: false,
        message: "Reconciliation not found",
      });
    }

    if (!reconciliation.locked) {
      return res.status(400).json({
        success: false,
        message: "Only finalized reconciliations can be reopened",
      });
    }

    await AccountTransaction.updateMany(
      {
        reconciliationNumber: reconciliation.reconciliationNumber,
      },
      {
        $set: {
          cleared: false,
          reconciled: false,
          clearedDate: "",
          reconciliationNumber: "",
          reconciliationDate: "",
          statementDate: "",
          reconciledBy: "",
          lockedByReconciliation: false,
        },
      }
    );

    reconciliation.status = "Reopened";
    reconciliation.locked = false;
    reconciliation.reopenedBy = getUserName(req.user);
    reconciliation.reopenedAt = new Date();
    await reconciliation.save();

    const account = await FinancialAccount.findOne({
      accountNumber: reconciliation.accountNumber,
    });

    if (account) {
      account.reconciliationStatus = "In Progress";
      account.unreconciledDifference = reconciliation.difference;
      await account.save();
    }

    res.json({
      success: true,
      message: "Bank reconciliation reopened successfully",
      data: reconciliation,
    });
  } catch (error) {
    console.error("Reopen reconciliation error:", error);

    res.status(500).json({
      success: false,
      message: "Could not reopen reconciliation",
      error: error.message,
    });
  }
};

module.exports = {
  getBankingDashboard,
  getBankRegister,
  getReconciliations,
  getReconciliationByNumber,
  createBankReconciliation,
  finalizeBankReconciliation,
  reopenBankReconciliation,
};