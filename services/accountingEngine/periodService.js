const AccountingPeriod = require("../../models/AccountingPeriod");
const JournalEntry = require("../../models/JournalEntry");

const { buildTrialBalance } = require("./trialBalanceService");
const { buildBalanceSheet } = require("./balanceSheetService");
const { buildProfitAndLoss } = require("./profitLossService");

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const getPeriodByDate = async (entryDate) => {
  const date = new Date(entryDate);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid accounting date.");
  }

  return AccountingPeriod.findOne({
    fiscalYear: date.getFullYear(),
    periodMonth: date.getMonth() + 1,
  });
};

const getCurrentPeriod = async () => {
  return getPeriodByDate(new Date());
};

const validatePeriod = async ({ periodNumber, user = null } = {}) => {
  const period = await AccountingPeriod.findOne({ periodNumber });

  if (!period) {
    throw new Error("Accounting period not found.");
  }

  const from = period.startDate;
  const to = period.endDate;

  const [trialBalance, balanceSheet, profitAndLoss, draftJournals, unpostedJournals] =
    await Promise.all([
      buildTrialBalance({ from, to }),
      buildBalanceSheet({ from, to }),
      buildProfitAndLoss({ from, to }),

      JournalEntry.find({
        entryDate: { $gte: from, $lte: to },
        status: "Draft",
      }),

      JournalEntry.find({
        entryDate: { $gte: from, $lte: to },
        status: { $in: ["Draft", "Pending Approval", "Approved"] },
      }),
    ]);

  const checklist = {
    trialBalanceBalanced: trialBalance.totals.isBalanced === true,
    profitAndLossGenerated: Boolean(profitAndLoss),
    balanceSheetGenerated: Boolean(balanceSheet),
    allJournalEntriesPosted: unpostedJournals.length === 0,
    noDraftJournals: draftJournals.length === 0,
    noUnreconciledBankAccounts: true,
    depreciationPosted: true,
    closingJournalCreated: Boolean(period.closingJournalEntry),
  };

  const validationErrors = [];
  const validationWarnings = [];

  if (!checklist.trialBalanceBalanced) {
    validationErrors.push(
      `Trial Balance is out of balance by ${trialBalance.totals.difference}.`
    );
  }

  if (!balanceSheet.totals.isBalanced) {
    validationErrors.push(
      `Balance Sheet is out of balance by ${balanceSheet.totals.difference}.`
    );
  }

  if (!checklist.noDraftJournals) {
    validationErrors.push(`${draftJournals.length} draft journal(s) found.`);
  }

  if (!checklist.allJournalEntriesPosted) {
    validationErrors.push(`${unpostedJournals.length} unposted journal(s) found.`);
  }

  if (!checklist.closingJournalCreated) {
    validationWarnings.push("Closing journal has not yet been created.");
  }

  const passed = validationErrors.length === 0;

  const summary = {
    period: {
      periodNumber: period.periodNumber,
      periodName: period.periodName,
      startDate: period.startDate,
      endDate: period.endDate,
      status: period.status,
    },

    trialBalance: trialBalance.totals,

    balanceSheet: balanceSheet.totals,

    profitAndLoss: {
      totalRevenue: profitAndLoss.revenue.total,
      totalCostOfSales: profitAndLoss.costOfSales.total,
      totalOperatingExpenses: profitAndLoss.operatingExpenses.total,
      grossProfit: profitAndLoss.grossProfit,
      netProfit: profitAndLoss.netProfit,
    },

    journals: {
      draftCount: draftJournals.length,
      unpostedCount: unpostedJournals.length,
    },
  };

  period.validationStatus = passed ? "Passed" : "Failed";
  period.validationSummary = summary;
  period.validationErrors = validationErrors;
  period.validationWarnings = validationWarnings;
  period.checklist = {
    ...period.checklist,
    ...checklist,
  };
  period.validatedAt = new Date();
  period.validatedBy = getUserName(user);

  await period.save();

  return {
    period,
    passed,
    checklist,
    errors: validationErrors,
    warnings: validationWarnings,
    summary,
  };
};

const buildCloseChecklist = async ({ periodNumber, user = null } = {}) => {
  const validation = await validatePeriod({ periodNumber, user });

  const { period, checklist, errors, warnings, summary } = validation;

  const closeChecklist = {
    validationPassed: validation.passed,
    trialBalanceBalanced: checklist.trialBalanceBalanced,
    profitAndLossGenerated: checklist.profitAndLossGenerated,
    balanceSheetGenerated: checklist.balanceSheetGenerated,
    allJournalEntriesPosted: checklist.allJournalEntriesPosted,
    noDraftJournals: checklist.noDraftJournals,
    noUnreconciledBankAccounts: checklist.noUnreconciledBankAccounts,
    depreciationPosted: checklist.depreciationPosted,
    closingJournalCreated: checklist.closingJournalCreated,
  };

  const requiredChecksPassed =
    closeChecklist.validationPassed &&
    closeChecklist.trialBalanceBalanced &&
    closeChecklist.profitAndLossGenerated &&
    closeChecklist.balanceSheetGenerated &&
    closeChecklist.allJournalEntriesPosted &&
    closeChecklist.noDraftJournals;

  period.status = requiredChecksPassed ? "Closing" : period.status;
  period.checklist = {
    ...period.checklist,
    ...closeChecklist,
  };

  await period.save();

  return {
    period,
    readyToClose: requiredChecksPassed,
    checklist: closeChecklist,
    errors,
    warnings,
    summary,
  };
};

const closePeriod = async ({ periodNumber, notes = "", user }) => {
  const checklistResult = await buildCloseChecklist({ periodNumber, user });

  const { period, readyToClose } = checklistResult;

  if (period.status === "Locked") {
    throw new Error("Locked accounting periods cannot be closed.");
  }

  if (period.status === "Closed") {
    throw new Error("Accounting period is already closed.");
  }

  if (!readyToClose) {
    throw new Error("Period cannot be closed because the close checklist is incomplete.");
  }

  period.status = "Closed";
  period.allowPosting = false;
  period.validationStatus = "Passed";
  period.closedAt = new Date();
  period.closedBy = getUserName(user);
  period.notes = notes || period.notes;

  await period.save();

  return period;
};

const lockPeriod = async ({ periodNumber, notes = "", user }) => {
  const validation = await validatePeriod({ periodNumber, user });
  const { period, passed } = validation;

  if (period.status === "Locked") {
    throw new Error("Locked accounting periods cannot be closed.");
  }

  if (period.status === "Closed") {
    throw new Error("Accounting period is already closed.");
  }

  if (!passed) {
    throw new Error("Period cannot be closed because validation failed.");
  }

  period.status = "Closed";
  period.allowPosting = false;
  period.validationStatus = "Passed";
  period.closedAt = new Date();
  period.closedBy = getUserName(user);
  period.notes = notes || period.notes;

  await period.save();

  return period;
};

const reopenPeriod = async ({ periodNumber, reason = "", user }) => {
  const period = await AccountingPeriod.findOne({ periodNumber });

  if (!period) {
    throw new Error("Accounting period not found.");
  }

  if (period.status === "Open") {
    throw new Error("Accounting period is already open.");
  }

  period.status = "Open";
  period.allowPosting = true;
  period.reopenedAt = new Date();
  period.reopenedBy = getUserName(user);
  period.reopenedReason = reason || "Period reopened";
  period.notes = reason || period.notes;

  await period.save();

  return period;
};

module.exports = {
  getPeriodByDate,
  getCurrentPeriod,
  validatePeriod,
  buildCloseChecklist,
  closePeriod,
  lockPeriod,
  reopenPeriod,
};