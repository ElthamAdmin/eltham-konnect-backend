const AccountingPeriod = require("../../models/AccountingPeriod");

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

const closePeriod = async ({ fiscalYear, periodMonth, notes = "", user }) => {
  const period = await AccountingPeriod.findOne({ fiscalYear, periodMonth });

  if (!period) {
    throw new Error("Accounting period not found.");
  }

  if (period.status === "Locked") {
    throw new Error("Locked accounting periods cannot be closed again.");
  }

  period.status = "Closed";
  period.closedAt = new Date();
  period.closedBy = getUserName(user);
  period.notes = notes || period.notes;

  await period.save();

  return period;
};

const lockPeriod = async ({ fiscalYear, periodMonth, notes = "", user }) => {
  const period = await AccountingPeriod.findOne({ fiscalYear, periodMonth });

  if (!period) {
    throw new Error("Accounting period not found.");
  }

  period.status = "Locked";
  period.lockedAt = new Date();
  period.lockedBy = getUserName(user);
  period.notes = notes || period.notes;

  await period.save();

  return period;
};

const reopenPeriod = async ({ fiscalYear, periodMonth, notes = "", user }) => {
  const period = await AccountingPeriod.findOne({ fiscalYear, periodMonth });

  if (!period) {
    throw new Error("Accounting period not found.");
  }

  period.status = "Open";
  period.notes = notes || `Reopened by ${getUserName(user)}`;

  await period.save();

  return period;
};

module.exports = {
  getPeriodByDate,
  closePeriod,
  lockPeriod,
  reopenPeriod,
};