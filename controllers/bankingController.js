const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const BankReconciliation = require("../models/BankReconciliation");
const ChartOfAccount = require("../models/ChartOfAccount");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getBankingDashboard = async (req, res) => {
  try {
    const accounts = await FinancialAccount.find().sort({
      accountName: 1,
    });

    const transactions = await AccountTransaction.find().sort({
      transactionDate: -1,
    });

    const reconciliations = await BankReconciliation.find().sort({
      createdAt: -1,
    });

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

const accountsWithLedgerBalances = accounts.map((account) => {
  const plain = account.toObject();
  const linkedChartAccount = chartMap[plain.linkedChartAccountCode];

  return {
    ...plain,
    currentBalance: roundMoney(linkedChartAccount?.currentBalance || 0),
    baseCurrencyBalance: roundMoney(linkedChartAccount?.currentBalance || 0),
    linkedChartAccount,
  };
});

const totalCash = accountsWithLedgerBalances.reduce(
  (sum, account) => sum + Number(account.currentBalance || 0),
  0
);

    res.json({
      success: true,
      totalCash,
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

const createBankReconciliation = async (req, res) => {
  try {
    const {
      accountNumber,
      statementDate,
      bankStatementBalance,
      notes,
    } = req.body;

    const account = await FinancialAccount.findOne({
      accountNumber,
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Financial account not found",
      });
    }

    const transactions = await AccountTransaction.find({
      accountNumber,
    }).sort({
      transactionDate: -1,
    });

    const reconciliationItems = transactions.map((transaction) => ({
      transactionNumber: transaction.transactionNumber,
      transactionType: transaction.transactionType,
      amount: Number(transaction.amount || 0),
      transactionDate: transaction.transactionDate,
      reference: transaction.reference,
      reconciled: false,
    }));

    const systemBalance = Number(account.currentBalance || 0);

    const difference =
      Number(bankStatementBalance || 0) - systemBalance;

    const reconciliation = await BankReconciliation.create({
      reconciliationNumber: `REC-${Date.now()}`,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      statementDate,
      bankStatementBalance: Number(bankStatementBalance || 0),
      systemBalance,
      adjustedBalance: systemBalance,
      difference,
      status:
        difference === 0
          ? "Balanced"
          : "Out of Balance",
      notes,
      reconciliationItems,
      completedBy: req.user?.name || "System User",
    });

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

module.exports = {
  getBankingDashboard,
  createBankReconciliation,
};