const FiscalYear = require("../../models/FiscalYear");
const AccountingPeriod = require("../../models/AccountingPeriod");
const JournalEntry = require("../../models/JournalEntry");

const { buildTrialBalance } = require("./trialBalanceService");
const { buildProfitAndLoss } = require("./profitLossService");
const { buildBalanceSheet } = require("./balanceSheetService");

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const buildFiscalYearStats = async (fiscalYear) => {
  const periods = await AccountingPeriod.find({
    fiscalYear: Number(fiscalYear),
  }).sort({ periodMonth: 1 });

  const openPeriods = periods.filter((period) => period.status === "Open");
  const closingPeriods = periods.filter((period) => period.status === "Closing");
  const closedPeriods = periods.filter((period) => period.status === "Closed");
  const lockedPeriods = periods.filter((period) => period.status === "Locked");

  return {
    periods,
    totalPeriodsFound: periods.length,
    openPeriods: openPeriods.length,
    closingPeriods: closingPeriods.length,
    closedPeriods: closedPeriods.length,
    lockedPeriods: lockedPeriods.length,
    incompletePeriods: [...openPeriods, ...closingPeriods],
  };
};

const validateFiscalYear = async ({ fiscalYear, user = null }) => {
  const year = await FiscalYear.findOne({
    fiscalYear: Number(fiscalYear),
  });

  if (!year) {
    throw new Error("Fiscal year not found.");
  }

  const stats = await buildFiscalYearStats(fiscalYear);

  const [trialBalance, profitAndLoss, balanceSheet, unpostedJournals] =
    await Promise.all([
      buildTrialBalance({ from: year.startDate, to: year.endDate }),
      buildProfitAndLoss({ from: year.startDate, to: year.endDate }),
      buildBalanceSheet({ from: year.startDate, to: year.endDate }),
      JournalEntry.find({
        entryDate: { $gte: year.startDate, $lte: year.endDate },
        status: { $in: ["Draft", "Pending Approval", "Approved"] },
      }),
    ]);

  const errors = [];
  const warnings = [];

  if (stats.incompletePeriods.length > 0) {
    errors.push(
      `${stats.incompletePeriods.length} accounting period(s) are still open or closing.`
    );
  }

  if (!trialBalance.totals.isBalanced) {
    errors.push(
      `Trial Balance is out of balance by ${trialBalance.totals.difference}.`
    );
  }

  if (!balanceSheet.totals.isBalanced) {
    errors.push(
      `Balance Sheet is out of balance by ${balanceSheet.totals.difference}.`
    );
  }

  if (unpostedJournals.length > 0) {
    errors.push(`${unpostedJournals.length} unposted journal(s) found.`);
  }

  if (stats.totalPeriodsFound < Number(year.totalPeriods || 12)) {
    warnings.push(
      `Only ${stats.totalPeriodsFound} of ${year.totalPeriods || 12} accounting periods exist.`
    );
  }

  const passed = errors.length === 0;

  const summary = {
    fiscalYear: year.fiscalYear,
    yearName: year.yearName,
    startDate: year.startDate,
    endDate: year.endDate,
    periodStats: {
      totalPeriodsExpected: year.totalPeriods,
      totalPeriodsFound: stats.totalPeriodsFound,
      openPeriods: stats.openPeriods,
      closingPeriods: stats.closingPeriods,
      closedPeriods: stats.closedPeriods,
      lockedPeriods: stats.lockedPeriods,
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
      unpostedCount: unpostedJournals.length,
    },
  };

  year.openPeriods = stats.openPeriods + stats.closingPeriods;
  year.closedPeriods = stats.closedPeriods;
  year.lockedPeriods = stats.lockedPeriods;
  year.validationStatus = passed ? "Passed" : "Failed";
  year.validationSummary = summary;
  year.validationErrors = errors;
  year.validationWarnings = warnings;
  year.validatedAt = new Date();
  year.validatedBy = getUserName(user);

  await year.save();

  return {
    year,
    passed,
    readyForYearEndClose: passed,
    errors,
    warnings,
    summary,
  };
};

const createFiscalYear = async ({
  fiscalYear,
  startDate,
  endDate,
  totalPeriods = 12,
  notes = "",
  isCurrentYear = false,
  user = null,
}) => {
  const existing = await FiscalYear.findOne({
    fiscalYear: Number(fiscalYear),
  });

  if (existing) {
    throw new Error("Fiscal year already exists.");
  }

  const currentYear = await FiscalYear.findOne({
    isCurrentYear: true,
  });

  if (isCurrentYear === true || !currentYear) {
    await FiscalYear.updateMany({}, { isCurrentYear: false });
  }

  const previousYear = await FiscalYear.findOne({
    fiscalYear: Number(fiscalYear) - 1,
  });

  const year = await FiscalYear.create({
    fiscalYear: Number(fiscalYear),
    yearName: `FY ${fiscalYear}`,
    startDate,
    endDate,
    totalPeriods: Number(totalPeriods || 12),
    notes,
    createdBy: getUserName(user),
    isCurrentYear: isCurrentYear === true || !currentYear,
    previousFiscalYear: previousYear?.fiscalYear || null,
  });

  if (previousYear && !previousYear.nextFiscalYear) {
    previousYear.nextFiscalYear = year.fiscalYear;
    await previousYear.save();
  }

  return year;
};

const closeFiscalYear = async ({ fiscalYear, user = null }) => {
  const validation = await validateFiscalYear({ fiscalYear, user });
  const { year, passed } = validation;

  if (year.status === "Locked") {
    throw new Error("Locked fiscal years cannot be modified.");
  }

  if (year.status === "Closed") {
    throw new Error("Fiscal year is already closed.");
  }

  if (!passed) {
    throw new Error("Fiscal year cannot be closed because validation failed.");
  }

  year.status = "Closed";
  year.allowPosting = false;
  year.yearEndCompleted = true;
  year.yearEndCompletedAt = new Date();
  year.yearEndCompletedBy = getUserName(user);
  year.closedBy = getUserName(user);
  year.closedAt = new Date();

  await year.save();

  return year;
};

const lockFiscalYear = async ({ fiscalYear, user = null }) => {
  const year = await FiscalYear.findOne({
    fiscalYear: Number(fiscalYear),
  });

  if (!year) {
    throw new Error("Fiscal year not found.");
  }

  if (year.status !== "Closed") {
    throw new Error("Fiscal year must be closed before locking.");
  }

  year.status = "Locked";
  year.allowPosting = false;
  year.lockedBy = getUserName(user);
  year.lockedAt = new Date();

  await year.save();

  return year;
};

const createNextFiscalYear = async ({ fiscalYear, user = null }) => {
  const year = await FiscalYear.findOne({
    fiscalYear: Number(fiscalYear),
  });

  if (!year) {
    throw new Error("Fiscal year not found.");
  }

  const nextYearValue = Number(fiscalYear) + 1;

  const existingNextYear = await FiscalYear.findOne({
    fiscalYear: nextYearValue,
  });

  if (existingNextYear) {
    return existingNextYear;
  }

  const nextYear = await createFiscalYear({
    fiscalYear: nextYearValue,
    startDate: `${nextYearValue}-01-01`,
    endDate: `${nextYearValue}-12-31`,
    totalPeriods: year.totalPeriods || 12,
    notes: `Automatically created from FY ${fiscalYear}`,
    isCurrentYear: false,
    user,
  });

  year.nextFiscalYear = nextYear.fiscalYear;
  await year.save();

  return nextYear;
};

module.exports = {
  buildFiscalYearStats,
  validateFiscalYear,
  createFiscalYear,
  closeFiscalYear,
  lockFiscalYear,
  createNextFiscalYear,
};