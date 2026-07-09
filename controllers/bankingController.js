const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const BankReconciliation = require("../models/BankReconciliation");
const BankStatementImport = require("../models/BankStatementImport");
const ChartOfAccount = require("../models/ChartOfAccount");
const { postJournalEntry } = require("../services/journalService");
const { SYSTEM_ACCOUNTS } = require("../services/accountingConstants");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const todayYMD = () => new Date().toISOString().slice(0, 10);

const generateReconciliationNumber = () =>
  `REC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const generateImportNumber = () =>
  `BST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

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

const normalizeStatementLines = (lines = []) =>
  lines
    .map((line, index) => {
      const amount = roundMoney(line.amount);
      const direction =
        line.transactionDirection ||
        line.direction ||
        (Number(line.deposit || 0) > 0 ? "Deposit" : "Withdrawal");

      return {
        lineNumber: index + 1,
        transactionDate: line.transactionDate || line.date || new Date(),
        description: line.description || line.memo || "",
        reference: line.reference || line.ref || "",
        transactionDirection:
          direction === "Deposit" ? "Deposit" : "Withdrawal",
        amount,
        runningBalance: roundMoney(line.runningBalance || line.balance || 0),
        notes: line.notes || "",
      };
    })
    .filter((line) => Number(line.amount || 0) > 0);

const getDateDifferenceInDays = (dateA, dateB) => {
  const a = new Date(dateA);
  const b = new Date(dateB);

  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 999;

  const diff = Math.abs(a.getTime() - b.getTime());
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const calculateMatchConfidence = ({ statementLine, transaction }) => {
  let score = 0;

  if (roundMoney(statementLine.amount) === roundMoney(transaction.amount)) {
    score += 50;
  }

  const dateDifference = getDateDifferenceInDays(
    statementLine.transactionDate,
    transaction.transactionDate
  );

  if (dateDifference === 0) score += 30;
  if (dateDifference === 1) score += 20;
  if (dateDifference > 1 && dateDifference <= 3) score += 10;

  const statementReference = String(statementLine.reference || "").toLowerCase();
  const transactionReference = String(transaction.reference || "").toLowerCase();

  if (
    statementReference &&
    transactionReference &&
    (statementReference.includes(transactionReference) ||
      transactionReference.includes(statementReference))
  ) {
    score += 20;
  }

  return Math.min(score, 100);
};

const refreshImportMatchCounts = (importedStatement) => {
  let matchedLines = 0;
  let suggestedLines = 0;
  let unmatchedLines = 0;
  let duplicateLines = 0;

  importedStatement.statementLines.forEach((line) => {
    if (line.matchStatus === "Matched") matchedLines += 1;
    else if (line.matchStatus === "Suggested") suggestedLines += 1;
    else if (line.matchStatus === "Duplicate") duplicateLines += 1;
    else unmatchedLines += 1;
  });

  importedStatement.matchedLines = matchedLines;
  importedStatement.suggestedLines = suggestedLines;
  importedStatement.unmatchedLines = unmatchedLines;
  importedStatement.duplicateLines = duplicateLines;

  importedStatement.status =
    matchedLines === importedStatement.totalLines
      ? "Matched"
      : matchedLines > 0 || suggestedLines > 0
      ? "Partially Matched"
      : "Imported";

  return importedStatement;
};

const importBankStatement = async (req, res) => {
  try {
    const {
      accountNumber,
      statementStartDate,
      statementDate,
      statementOpeningBalance,
      statementClosingBalance,
      sourceType,
      sourceFileName,
      notes,
      statementLines = [],
    } = req.body;

    if (!accountNumber || !statementDate) {
      return res.status(400).json({
        success: false,
        message: "Account number and statement date are required.",
      });
    }

    const account = await FinancialAccount.findOne({
      accountNumber,
      status: "Active",
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Active financial account not found.",
      });
    }

    const normalizedLines = normalizeStatementLines(statementLines);

    if (normalizedLines.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one valid statement line is required.",
      });
    }

    const importedStatement = await BankStatementImport.create({
      importNumber: generateImportNumber(),
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      statementStartDate: statementStartDate || "",
      statementDate,
      statementOpeningBalance: roundMoney(statementOpeningBalance || 0),
      statementClosingBalance: roundMoney(statementClosingBalance || 0),
      sourceType: sourceType || "Manual",
      sourceFileName: sourceFileName || "",
      totalLines: normalizedLines.length,
      unmatchedLines: normalizedLines.length,
      importedBy: getUserName(req.user),
      notes: notes || "",
      statementLines: normalizedLines,
    });

    res.status(201).json({
      success: true,
      message: "Bank statement imported successfully.",
      data: importedStatement,
    });
  } catch (error) {
    console.error("Bank statement import error:", error);

    res.status(500).json({
      success: false,
      message: "Could not import bank statement.",
      error: error.message,
    });
  }
};

const autoMatchBankStatement = async (req, res) => {
  try {
    const { importNumber } = req.body;

    if (!importNumber) {
      return res.status(400).json({
        success: false,
        message: "Import number is required.",
      });
    }

    const importedStatement = await BankStatementImport.findOne({
      importNumber,
    });

    if (!importedStatement) {
      return res.status(404).json({
        success: false,
        message: "Imported statement not found.",
      });
    }

    const ledgerTransactions = await AccountTransaction.find({
      accountNumber: importedStatement.accountNumber,
      reconciled: { $ne: true },
      lockedByReconciliation: { $ne: true },
    });

    let matchedLines = 0;
    let suggestedLines = 0;
    let unmatchedLines = 0;

    importedStatement.statementLines.forEach((line) => {
      const candidates = ledgerTransactions
        .filter((transaction) => {
          const sameAmount =
            roundMoney(transaction.amount) === roundMoney(line.amount);

          const sameDirection =
            getTransactionDirection(transaction.transactionType) ===
            line.transactionDirection;

          const withinDateRange =
            getDateDifferenceInDays(
              line.transactionDate,
              transaction.transactionDate
            ) <= 3;

          return sameAmount && sameDirection && withinDateRange;
        })
        .map((transaction) => ({
          transaction,
          confidence: calculateMatchConfidence({
            statementLine: line,
            transaction,
          }),
        }))
        .sort((a, b) => b.confidence - a.confidence);

      const bestMatch = candidates[0];

      if (!bestMatch) {
        line.matchStatus = "Unmatched";
        line.matchConfidence = 0;
        line.matchingMethod = "";
        unmatchedLines += 1;
        return;
      }

      line.matchedTransactionNumber = bestMatch.transaction.transactionNumber;
      line.matchedJournalEntryNumber =
        bestMatch.transaction.journalEntryNumber || "";
      line.matchConfidence = bestMatch.confidence;

      if (bestMatch.confidence >= 95) {
        line.matchStatus = "Matched";
        line.matchingMethod = "Automatic Exact Match";
        matchedLines += 1;
      } else if (bestMatch.confidence >= 70) {
        line.matchStatus = "Suggested";
        line.matchingMethod = "Suggested Match";
        suggestedLines += 1;
      } else {
        line.matchStatus = "Unmatched";
        line.matchingMethod = "";
        unmatchedLines += 1;
      }
    });

    importedStatement.matchedLines = matchedLines;
    importedStatement.suggestedLines = suggestedLines;
    importedStatement.unmatchedLines = unmatchedLines;
    importedStatement.status =
      matchedLines === importedStatement.totalLines
        ? "Matched"
        : matchedLines > 0 || suggestedLines > 0
        ? "Partially Matched"
        : "Imported";

    await importedStatement.save();

    res.json({
      success: true,
      message: "Bank statement auto-match completed.",
      data: importedStatement,
    });
  } catch (error) {
    console.error("Bank statement auto-match error:", error);

    res.status(500).json({
      success: false,
      message: "Could not auto-match bank statement.",
      error: error.message,
    });
  }
};

const getImportedStatements = async (req, res) => {
  try {
    const importedStatements = await BankStatementImport.find().sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: importedStatements,
    });
  } catch (error) {
    console.error("Imported statements error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load imported statements.",
      error: error.message,
    });
  }
};

const acceptStatementMatch = async (req, res) => {
  try {
    const { importNumber, lineId, transactionNumber } = req.body;

    if (!importNumber || !lineId) {
      return res.status(400).json({
        success: false,
        message: "Import number and statement line ID are required.",
      });
    }

    const importedStatement = await BankStatementImport.findOne({
      importNumber,
    });

    if (!importedStatement) {
      return res.status(404).json({
        success: false,
        message: "Imported statement not found.",
      });
    }

    const statementLine = importedStatement.statementLines.id(lineId);

    if (!statementLine) {
      return res.status(404).json({
        success: false,
        message: "Statement line not found.",
      });
    }

    const finalTransactionNumber =
      transactionNumber || statementLine.matchedTransactionNumber;

    if (!finalTransactionNumber) {
      return res.status(400).json({
        success: false,
        message: "A matched transaction number is required.",
      });
    }

    const transaction = await AccountTransaction.findOne({
      transactionNumber: finalTransactionNumber,
      accountNumber: importedStatement.accountNumber,
      lockedByReconciliation: { $ne: true },
      reconciled: { $ne: true },
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Available ledger transaction not found for this match.",
      });
    }

    statementLine.matchedTransactionNumber = transaction.transactionNumber;
    statementLine.matchedJournalEntryNumber =
      transaction.journalEntryNumber || "";
    statementLine.matchStatus = "Matched";
    statementLine.matchConfidence = 100;
    statementLine.matchingMethod = "Manual Match Approved";
    statementLine.reviewStatus = "Approved";
    statementLine.notes = statementLine.notes || "Match approved manually.";

    refreshImportMatchCounts(importedStatement);

    await importedStatement.save();

    res.json({
      success: true,
      message: "Statement match accepted successfully.",
      data: importedStatement,
    });
  } catch (error) {
    console.error("Accept statement match error:", error);

    res.status(500).json({
      success: false,
      message: "Could not accept statement match.",
      error: error.message,
    });
  }
};

const rejectStatementMatch = async (req, res) => {
  try {
    const { importNumber, lineId, notes } = req.body;

    if (!importNumber || !lineId) {
      return res.status(400).json({
        success: false,
        message: "Import number and statement line ID are required.",
      });
    }

    const importedStatement = await BankStatementImport.findOne({
      importNumber,
    });

    if (!importedStatement) {
      return res.status(404).json({
        success: false,
        message: "Imported statement not found.",
      });
    }

    const statementLine = importedStatement.statementLines.id(lineId);

    if (!statementLine) {
      return res.status(404).json({
        success: false,
        message: "Statement line not found.",
      });
    }

    statementLine.matchStatus = "Unmatched";
    statementLine.matchedTransactionNumber = "";
    statementLine.matchedJournalEntryNumber = "";
    statementLine.matchConfidence = 0;
    statementLine.matchingMethod = "";
    statementLine.reviewStatus = "Pending Review";
    statementLine.notes = notes || "Match rejected manually.";

    refreshImportMatchCounts(importedStatement);

    await importedStatement.save();

    res.json({
      success: true,
      message: "Statement match rejected successfully.",
      data: importedStatement,
    });
  } catch (error) {
    console.error("Reject statement match error:", error);

    res.status(500).json({
      success: false,
      message: "Could not reject statement match.",
      error: error.message,
    });
  }
};

const searchLedgerTransactionsForMatch = async (req, res) => {
  try {
    const {
      accountNumber,
      amount,
      transactionDirection,
      reference = "",
      from = "",
      to = "",
    } = req.query;

    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: "Account number is required.",
      });
    }

    const query = {
      accountNumber,
      reconciled: { $ne: true },
      lockedByReconciliation: { $ne: true },
    };

    if (amount) {
      query.amount = roundMoney(amount);
    }

    if (from || to) {
      query.transactionDate = {};

      if (from) {
        query.transactionDate.$gte = new Date(from);
      }

      if (to) {
        query.transactionDate.$lte = new Date(to);
      }
    }

    if (reference) {
      query.$or = [
        { reference: { $regex: reference, $options: "i" } },
        { notes: { $regex: reference, $options: "i" } },
        { transactionNumber: { $regex: reference, $options: "i" } },
        { journalEntryNumber: { $regex: reference, $options: "i" } },
      ];
    }

    const transactions = await AccountTransaction.find(query)
      .sort({ transactionDate: -1, createdAt: -1 })
      .limit(100);

    const filteredTransactions = transactionDirection
      ? transactions.filter(
          (transaction) =>
            getTransactionDirection(transaction.transactionType) ===
            transactionDirection
        )
      : transactions;

    res.json({
      success: true,
      data: filteredTransactions,
    });
  } catch (error) {
    console.error("Ledger match search error:", error);

    res.status(500).json({
      success: false,
      message: "Could not search ledger transactions.",
      error: error.message,
    });
  }
};

const splitMatchStatementLine = async (req, res) => {
  try {
    const { importNumber, lineId, transactionNumbers = [] } = req.body;

    if (!importNumber || !lineId || transactionNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Import number, statement line ID, and transaction numbers are required.",
      });
    }

    const importedStatement = await BankStatementImport.findOne({
      importNumber,
    });

    if (!importedStatement) {
      return res.status(404).json({
        success: false,
        message: "Imported statement not found.",
      });
    }

    const statementLine = importedStatement.statementLines.id(lineId);

    if (!statementLine) {
      return res.status(404).json({
        success: false,
        message: "Statement line not found.",
      });
    }

    const ledgerTransactions = await AccountTransaction.find({
      transactionNumber: { $in: transactionNumbers },
      accountNumber: importedStatement.accountNumber,
      lockedByReconciliation: { $ne: true },
      reconciled: { $ne: true },
    });

    if (ledgerTransactions.length !== transactionNumbers.length) {
      return res.status(400).json({
        success: false,
        message:
          "One or more selected ledger transactions could not be found or are already reconciled.",
      });
    }

    const invalidDirection = ledgerTransactions.find(
      (transaction) =>
        getTransactionDirection(transaction.transactionType) !==
        statementLine.transactionDirection
    );

    if (invalidDirection) {
      return res.status(400).json({
        success: false,
        message:
          "All split transactions must have the same deposit/withdrawal direction as the statement line.",
      });
    }

    const splitTotal = roundMoney(
      ledgerTransactions.reduce(
        (sum, transaction) => sum + Number(transaction.amount || 0),
        0
      )
    );

    const statementAmount = roundMoney(statementLine.amount || 0);
    const splitDifference = roundMoney(statementAmount - splitTotal);

    statementLine.isSplitMatch = true;
    statementLine.splitMatches = ledgerTransactions.map((transaction) => ({
      transactionNumber: transaction.transactionNumber,
      journalEntryNumber: transaction.journalEntryNumber || "",
      amount: roundMoney(transaction.amount || 0),
      transactionType: transaction.transactionType,
      reference: transaction.reference || "",
      notes: transaction.notes || "",
    }));

    statementLine.splitDifference = splitDifference;
    statementLine.matchedTransactionNumber = ledgerTransactions
      .map((transaction) => transaction.transactionNumber)
      .join(", ");
    statementLine.matchedJournalEntryNumber = ledgerTransactions
      .map((transaction) => transaction.journalEntryNumber || "")
      .filter(Boolean)
      .join(", ");

    statementLine.matchStatus =
      splitDifference === 0 ? "Matched" : "Suggested";

    statementLine.matchConfidence = splitDifference === 0 ? 100 : 80;
    statementLine.matchingMethod =
      splitDifference === 0
        ? "Manual Split Match"
        : "Manual Split Match - Difference Requires Review";
    statementLine.reviewStatus =
      splitDifference === 0 ? "Approved" : "Pending Review";

    refreshImportMatchCounts(importedStatement);

    await importedStatement.save();

    res.json({
      success: true,
      message:
        splitDifference === 0
          ? "Statement line split matched successfully."
          : "Split match saved with a difference that requires review.",
      data: importedStatement,
      splitTotal,
      splitDifference,
    });
  } catch (error) {
    console.error("Split statement match error:", error);

    res.status(500).json({
      success: false,
      message: "Could not split match statement line.",
      error: error.message,
    });
  }
};

const createReconciliationAdjustment = async (req, res) => {
  try {
    const {
      importNumber,
      lineId,
      adjustmentType,
      description,
      amount,
      transactionDate,
      adjustmentAccountCode,
    } = req.body;

    if (!importNumber || !lineId || !adjustmentType || !amount) {
      return res.status(400).json({
        success: false,
        message:
          "Import number, statement line ID, adjustment type, and amount are required.",
      });
    }

    const importedStatement = await BankStatementImport.findOne({
      importNumber,
    });

    if (!importedStatement) {
      return res.status(404).json({
        success: false,
        message: "Imported statement not found.",
      });
    }

    const statementLine = importedStatement.statementLines.id(lineId);

    if (!statementLine) {
      return res.status(404).json({
        success: false,
        message: "Statement line not found.",
      });
    }

    const account = await FinancialAccount.findOne({
      accountNumber: importedStatement.accountNumber,
      status: "Active",
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Active financial account not found.",
      });
    }

    if (!account.linkedChartAccountCode) {
      return res.status(400).json({
        success: false,
        message:
          "Selected financial account is not linked to the Chart of Accounts.",
      });
    }

    const numericAmount = roundMoney(amount);

    if (numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Adjustment amount must be greater than zero.",
      });
    }

    const isDeposit = statementLine.transactionDirection === "Deposit";

    const defaultAdjustmentAccountCode =
      adjustmentType === "Interest Earned"
        ? SYSTEM_ACCOUNTS.MARKETPLACE_REVENUE
        : SYSTEM_ACCOUNTS.OPERATING_EXPENSE;

    const finalAdjustmentAccountCode =
      adjustmentAccountCode || defaultAdjustmentAccountCode;

    const journalLines = isDeposit
      ? [
          {
            accountCode: account.linkedChartAccountCode,
            debit: numericAmount,
            credit: 0,
            description: description || adjustmentType,
          },
          {
            accountCode: finalAdjustmentAccountCode,
            debit: 0,
            credit: numericAmount,
            description: description || adjustmentType,
          },
        ]
      : [
          {
            accountCode: finalAdjustmentAccountCode,
            debit: numericAmount,
            credit: 0,
            description: description || adjustmentType,
          },
          {
            accountCode: account.linkedChartAccountCode,
            debit: 0,
            credit: numericAmount,
            description: description || adjustmentType,
          },
        ];

    const journalEntry = await postJournalEntry({
      entryDate:
        transactionDate ||
        statementLine.transactionDate ||
        importedStatement.statementDate,
      memo: `Bank reconciliation adjustment - ${adjustmentType}`,
      reference: importedStatement.importNumber,
      sourceModule: "Bank Reconciliation",
      createdBy: getUserName(req.user),
      lines: journalLines,
    });

    const transactionNumber = `TRN-${Date.now()}`;

    const transactionType =
      adjustmentType === "Bank Fee"
        ? "Bank Fee"
        : adjustmentType === "Interest Earned"
        ? "Interest Income"
        : adjustmentType === "Interest Charged"
        ? "Interest Expense"
        : "Adjustment";

    const accountTransaction = await AccountTransaction.create({
      transactionNumber,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      linkedChartAccountCode: account.linkedChartAccountCode,
      journalEntryNumber: journalEntry.entryNumber,
      ledgerReference: journalEntry.entryNumber,
      transactionType,
      amount: numericAmount,
      reference: adjustmentType,
      notes: description || `Reconciliation adjustment - ${adjustmentType}`,
      transactionDate:
        transactionDate ||
        statementLine.transactionDate ||
        importedStatement.statementDate,
      adjustmentReason: description || adjustmentType,
      adjustmentType,
    });

    statementLine.matchStatus = "Matched";
    statementLine.matchedTransactionNumber = accountTransaction.transactionNumber;
    statementLine.matchedJournalEntryNumber = journalEntry.entryNumber;
    statementLine.matchConfidence = 100;
    statementLine.matchingMethod = "Reconciliation Adjustment";
    statementLine.reviewStatus = "Approved";
    statementLine.notes =
      description || `Adjustment created for ${adjustmentType}`;

    refreshImportMatchCounts(importedStatement);

    await importedStatement.save();

    res.status(201).json({
      success: true,
      message: "Reconciliation adjustment created successfully.",
      data: {
        importedStatement,
        journalEntry,
        accountTransaction,
      },
    });
  } catch (error) {
    console.error("Reconciliation adjustment error:", error);

    res.status(500).json({
      success: false,
      message: "Could not create reconciliation adjustment.",
      error: error.message,
    });
  }
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

        const treasurySummary = accountsWithLedgerBalances.reduce(
      (summary, account) => {
        const balance = Number(account.currentBalance || 0);
        const creditLimit = Number(account.creditLimit || 0);

        if (account.accountType === "Bank" || account.accountType === "Cash") {
          summary.cashAndBank = roundMoney(summary.cashAndBank + balance);
        }

        if (account.accountType === "Credit Card") {
          summary.creditCardOutstanding = roundMoney(
            summary.creditCardOutstanding + balance
          );

          summary.totalCreditLimit = roundMoney(
            summary.totalCreditLimit + creditLimit
          );
        }

        return summary;
      },
      {
        cashAndBank: 0,
        creditCardOutstanding: 0,
        totalCreditLimit: 0,
      }
    );

    treasurySummary.availableCredit = roundMoney(
      treasurySummary.totalCreditLimit - treasurySummary.creditCardOutstanding
    );

    treasurySummary.netTreasuryPosition = roundMoney(
      treasurySummary.cashAndBank - treasurySummary.creditCardOutstanding
    );

    const unreconciledTransactions = transactions.filter(
      (transaction) => !transaction.reconciled
    );

    res.json({
      success: true,
            totalCash: treasurySummary.cashAndBank,
      cashAndBank: treasurySummary.cashAndBank,
      creditCardOutstanding: treasurySummary.creditCardOutstanding,
      totalCreditLimit: treasurySummary.totalCreditLimit,
      availableCredit: treasurySummary.availableCredit,
      netTreasuryPosition: treasurySummary.netTreasuryPosition,
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

const startReconciliationWizard = async (req, res) => {
  try {
    const { accountNumber, importNumber } = req.body;

    const statement = await BankStatementImport.findOne({
      importNumber,
    });

    if (!statement) {
      return res.status(404).json({
        success: false,
        message: "Statement not found.",
      });
    }

    const transactions = await AccountTransaction.find({
      accountNumber,
      reconciled: false,
    }).sort({
      transactionDate: 1,
    });

    res.json({
      success: true,
      step: 1,

      accountNumber,

      statement,

      transactions,

      totals: {
        ledgerTransactions: transactions.length,
        statementLines: statement.statementLines.length,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const loadReconciliationWorkspace = async (req, res) => {
  try {
    const { importNumber } = req.params;

    const statement =
      await BankStatementImport.findOne({
        importNumber,
      });

    if (!statement) {
      return res.status(404).json({
        success: false,
      });
    }

    res.json({
      success: true,
      data: statement,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
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
  importBankStatement,
  autoMatchBankStatement,
  getImportedStatements,
  startReconciliationWizard,
loadReconciliationWorkspace,
acceptStatementMatch,
rejectStatementMatch,
searchLedgerTransactionsForMatch,
splitMatchStatementLine,
createReconciliationAdjustment,
};