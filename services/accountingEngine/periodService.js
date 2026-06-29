const AccountingPeriod = require("../../models/AccountingPeriod");
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

const validatePeriod = async ({ periodNumber }) => {
  const period = await AccountingPeriod.findOne({ periodNumber });

  if (!period) {
    throw new Error("Accounting period not found.");
  }

  const from = period.startDate;
  const to = period.endDate;

  const [trialBalance, balanceSheet, profitAndLoss] = await Promise.all([
    buildTrialBalance({ from, to }),
    buildBalanceSheet({ from, to }),
    buildProfitAndLoss({ from, to }),
  ]);

  const passed =
    trialBalance.totals.isBalanced === true &&
    balanceSheet.totals.isBalanced === true;

  const summary = {
    trialBalance: trialBalance.totals,
    balanceSheet: balanceSheet.totals,
    profitAndLoss: {
      totalRevenue: profitAndLoss.revenue.total,
      totalCostOfSales: profitAndLoss.costOfSales.total,
      totalOperatingExpenses: profitAndLoss.operatingExpenses.total,
      netProfit: profitAndLoss.netProfit,
    },
  };

  return {
    period,
    passed,
    summary,
  };
};

const closePeriod = async ({ periodNumber, notes = "", user }) => {
  const { period, passed, summary } = await validatePeriod({ periodNumber });

  if (period.status === "Locked") {
    throw new Error("Locked accounting periods cannot be closed.");
  }

  if (period.status === "Closed") {
    throw new Error("Accounting period is already closed.");
  }

  if (!passed) {
    period.validationStatus = "Failed";
    period.validationSummary = summary;
    period.validatedAt = new Date();
    period.validatedBy = getUserName(user);
    await period.save();

    throw new Error("Period cannot be closed because validation failed.");
  }

  period.status = "Closed";
  period.allowPosting = false;
  period.validationStatus = "Passed";
  period.validationSummary = summary;
  period.validatedAt = new Date();
  period.validatedBy = getUserName(user);
  period.closedAt = new Date();
  period.closedBy = getUserName(user);
  period.notes = notes || period.notes;

  await period.save();

  return period;
};

const lockPeriod = async ({ periodNumber, notes = "", user }) => {
  const period = await AccountingPeriod.findOne({ periodNumber });

  if (!period) {
    throw new Error("Accounting period not found.");
  }

  if (period.status === "Open") {
    throw new Error("Accounting period must be closed before locking.");
  }

  period.status = "Locked";
  period.allowPosting = false;
  period.lockedAt = new Date();
  period.lockedBy = getUserName(user);
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
  closePeriod,
  lockPeriod,
  reopenPeriod,
};