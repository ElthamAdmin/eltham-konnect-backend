const FinancialAdjustmentBatch = require("../../models/FinancialAdjustmentBatch");
const FinancialAccount = require("../../models/FinancialAccount");
const ChartOfAccount = require("../../models/ChartOfAccount");
const AccountTransaction = require("../../models/AccountTransaction");

const { postJournalEntry } = require("./journalService");
const { SYSTEM_ACCOUNTS } = require("./accountingConstants");
const { roundMoney } = require("./money");
const { writeFinanceAuditLog } = require("../../utils/financeAuditHelper");

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const generateBatchNumber = () =>
  `ADJ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const ensureAdjustmentAccount = async () => {
  const existing = await ChartOfAccount.findOne({
    accountCode: SYSTEM_ACCOUNTS.FINANCIAL_POSITION_ADJUSTMENTS,
  });

  if (existing) return existing;

  return ChartOfAccount.create({
    accountCode: SYSTEM_ACCOUNTS.FINANCIAL_POSITION_ADJUSTMENTS,
    accountName: "Financial Position Adjustments",
    accountCategory: "Equity",
    accountType: "Equity",
    normalBalance: "Credit",
    openingBalance: 0,
    currentBalance: 0,
    description:
      "Controlled account used for financial position and prior-period balance adjustments.",
    isSystemAccount: true,
    allowManualEntries: false,
    status: "Active",
  });
};

const calculateBaseAmount = ({ amount, currency, exchangeRate }) => {
  if (String(currency || "JMD").toUpperCase() === "JMD") {
    return roundMoney(amount);
  }

  return roundMoney(Number(amount || 0) * Number(exchangeRate || 1));
};

const buildPositionPreview = async ({ actualBalances = [] }) => {
  const actualMap = {};
  actualBalances.forEach((item) => {
    actualMap[item.accountNumber] = item;
  });

  const accounts = await FinancialAccount.find({ status: "Active" }).sort({
    accountName: 1,
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

  return accounts.map((account) => {
    const chartAccount = chartMap[account.linkedChartAccountCode];

    const currency = String(account.currency || "JMD").toUpperCase();
    const exchangeRate = Number(account.exchangeRate || 1);

    const ledgerBaseBalance = roundMoney(chartAccount?.currentBalance || 0);

    const ledgerBalance =
      currency === "JMD"
        ? ledgerBaseBalance
        : roundMoney(account.currentBalance || 0);

    const actualInput = actualMap[account.accountNumber];

    const actualBalance =
      actualInput?.actualBalance !== undefined
        ? roundMoney(actualInput.actualBalance)
        : ledgerBalance;

    const actualBaseBalance = calculateBaseAmount({
      amount: actualBalance,
      currency,
      exchangeRate,
    });

    return {
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      accountType: account.accountType,
      linkedChartAccountCode: account.linkedChartAccountCode,
      currency,
      exchangeRate,
      ledgerBalance,
      actualBalance,
      ledgerBaseBalance,
      actualBaseBalance,
      difference: roundMoney(actualBaseBalance - ledgerBaseBalance),
      notes: actualInput?.notes || "",
    };
  });
};

const createAdjustmentBatch = async ({
  effectiveDate,
  description = "",
  adjustmentReason,
  actualBalances = [],
  user = null,
}) => {
  if (!effectiveDate) {
    throw new Error("Effective date is required.");
  }

  if (!adjustmentReason) {
    throw new Error("Adjustment reason is required.");
  }

  const lines = await buildPositionPreview({ actualBalances });

  const adjustmentLines = lines.filter(
    (line) => Math.abs(Number(line.difference || 0)) > 0
  );

  if (adjustmentLines.length === 0) {
    throw new Error("No balance differences found to adjust.");
  }

  const batch = await FinancialAdjustmentBatch.create({
    batchNumber: generateBatchNumber(),
    effectiveDate,
    description,
    adjustmentReason,
    lines: adjustmentLines,
    createdBy: getUserName(user),
  });

  return batch;
};

const buildJournalLinesForBatch = async (batch) => {
  await ensureAdjustmentAccount();

  const journalLines = [];

  batch.lines.forEach((line) => {
    const difference = roundMoney(line.difference);

    if (difference === 0) return;

    const amount = Math.abs(difference);
    const isCreditCard = line.accountType === "Credit Card";

    if (!line.linkedChartAccountCode) {
      throw new Error(`${line.accountName} is not linked to the Chart of Accounts.`);
    }

    if (!isCreditCard && difference > 0) {
      journalLines.push(
        {
          accountCode: line.linkedChartAccountCode,
          debit: amount,
          credit: 0,
          description: `Increase ${line.accountName} to actual balance`,
        },
        {
          accountCode: SYSTEM_ACCOUNTS.FINANCIAL_POSITION_ADJUSTMENTS,
          debit: 0,
          credit: amount,
          description: `Offset for ${line.accountName} adjustment`,
        }
      );
    }

    if (!isCreditCard && difference < 0) {
      journalLines.push(
        {
          accountCode: SYSTEM_ACCOUNTS.FINANCIAL_POSITION_ADJUSTMENTS,
          debit: amount,
          credit: 0,
          description: `Offset for ${line.accountName} adjustment`,
        },
        {
          accountCode: line.linkedChartAccountCode,
          debit: 0,
          credit: amount,
          description: `Decrease ${line.accountName} to actual balance`,
        }
      );
    }

    if (isCreditCard && difference > 0) {
      journalLines.push(
        {
          accountCode: SYSTEM_ACCOUNTS.FINANCIAL_POSITION_ADJUSTMENTS,
          debit: amount,
          credit: 0,
          description: `Offset for ${line.accountName} liability adjustment`,
        },
        {
          accountCode: line.linkedChartAccountCode,
          debit: 0,
          credit: amount,
          description: `Increase ${line.accountName} liability to actual balance`,
        }
      );
    }

    if (isCreditCard && difference < 0) {
      journalLines.push(
        {
          accountCode: line.linkedChartAccountCode,
          debit: amount,
          credit: 0,
          description: `Decrease ${line.accountName} liability to actual balance`,
        },
        {
          accountCode: SYSTEM_ACCOUNTS.FINANCIAL_POSITION_ADJUSTMENTS,
          debit: 0,
          credit: amount,
          description: `Offset for ${line.accountName} liability adjustment`,
        }
      );
    }
  });

  return journalLines;
};

const postAdjustmentBatch = async ({ batchNumber, user = null, req = null }) => {
  const batch = await FinancialAdjustmentBatch.findOne({ batchNumber });

  if (!batch) {
    throw new Error("Adjustment batch not found.");
  }

  if (batch.status !== "Draft") {
    throw new Error(`Adjustment batch is already ${batch.status}.`);
  }

  const journalLines = await buildJournalLinesForBatch(batch);

  if (journalLines.length < 2) {
    throw new Error("Adjustment journal requires at least two lines.");
  }

  const journalEntry = await postJournalEntry({
    entryDate: batch.effectiveDate,
    memo: `Financial position adjustment ${batch.batchNumber}`,
    reference: batch.batchNumber,
    sourceModule: "Financial Position Adjustment",
    createdBy: getUserName(user),
    lines: journalLines,
  });

  for (const line of batch.lines) {
    const account = await FinancialAccount.findOne({
      accountNumber: line.accountNumber,
    });

    if (!account) continue;

    account.currentBalance = roundMoney(line.actualBalance);
    account.baseCurrencyBalance = roundMoney(line.actualBaseBalance);
    account.lastAdjustmentBatch = batch.batchNumber;
    account.lastAdjustmentDate = batch.effectiveDate;

    await account.save();

    await AccountTransaction.create({
      transactionNumber: `TRN-ADJ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      accountNumber: line.accountNumber,
      accountName: line.accountName,
      linkedChartAccountCode: line.linkedChartAccountCode,
      journalEntryNumber: journalEntry.entryNumber,
      ledgerReference: journalEntry.entryNumber,
      transactionType: "Adjustment",
      amount: Math.abs(roundMoney(line.difference)),
      reference: batch.batchNumber,
      notes: `${batch.adjustmentReason}: ${line.notes || batch.description}`,
      transactionDate: new Date(batch.effectiveDate),
      adjustmentBatchNumber: batch.batchNumber,
      adjustmentReason: batch.adjustmentReason,
      adjustmentType: "Financial Position Adjustment",
    });
  }

  batch.status = "Posted";
  batch.journalEntryNumber = journalEntry.entryNumber;
  batch.postedBy = getUserName(user);
  batch.postedAt = new Date();

  await batch.save();

  await writeFinanceAuditLog({
    req,
    action: "FINANCIAL_POSITION_ADJUSTMENT_POSTED",
    description: `Financial position adjustment ${batch.batchNumber} posted`,
    targetType: "FinancialAdjustmentBatch",
    targetId: batch.batchNumber,
    postingDate: batch.effectiveDate,
    journalEntry,
    performedByName: getUserName(user),
    metadata: {
      adjustmentReason: batch.adjustmentReason,
      lineCount: batch.lines.length,
      journalEntryNumber: journalEntry.entryNumber,
    },
  });

  return {
    batch,
    journalEntry,
  };
};

const getAdjustmentBatches = async () =>
  FinancialAdjustmentBatch.find().sort({ createdAt: -1 });

module.exports = {
  buildPositionPreview,
  createAdjustmentBatch,
  postAdjustmentBatch,
  getAdjustmentBatches,
};