const FiscalYear = require("../../models/FiscalYear");
const ChartOfAccount = require("../../models/ChartOfAccount");

const { postJournalEntry } = require("./journalService");
const fiscalYearService = require("./fiscalYearService");
const { roundMoney } = require("./money");

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const generateOpeningBalances = async ({ fiscalYear, user = null }) => {
  const year = await FiscalYear.findOne({ fiscalYear: Number(fiscalYear) });

  if (!year) {
    throw new Error("Fiscal year not found.");
  }

  const nextYear = await fiscalYearService.createNextFiscalYear({
    fiscalYear,
    user,
  });

  if (year.openingJournalEntry) {
    return {
      alreadyCreated: true,
      openingJournalEntry: year.openingJournalEntry,
      nextFiscalYear: nextYear,
    };
  }

  const balanceSheetAccounts = await ChartOfAccount.find({
    status: "Active",
    accountCategory: { $in: ["Asset", "Liability", "Equity"] },
  }).sort({ accountCode: 1 });

  const lines = [];

  balanceSheetAccounts.forEach((account) => {
    const balance = roundMoney(account.currentBalance || 0);

    if (balance === 0) return;

    if (account.normalBalance === "Debit") {
      lines.push({
        accountCode: account.accountCode,
        debit: balance > 0 ? balance : 0,
        credit: balance < 0 ? Math.abs(balance) : 0,
        description: `Opening balance for ${account.accountName}`,
      });
    } else {
      lines.push({
        accountCode: account.accountCode,
        debit: balance < 0 ? Math.abs(balance) : 0,
        credit: balance > 0 ? balance : 0,
        description: `Opening balance for ${account.accountName}`,
      });
    }
  });

  if (lines.length < 2) {
    throw new Error("Opening balance journal requires at least two balance sheet accounts.");
  }

  const openingEntry = await postJournalEntry({
    entryDate: `${nextYear.fiscalYear}-01-01`,
    memo: `Opening Balance Journal - FY ${nextYear.fiscalYear}`,
    reference: `OPENING-${nextYear.fiscalYear}`,
    sourceModule: "Year-End Opening Balance",
    createdBy: getUserName(user),
    lines,
  });

  year.openingJournalEntry = openingEntry.entryNumber;
  year.nextFiscalYear = nextYear.fiscalYear;
  await year.save();

  nextYear.openingJournalEntry = openingEntry.entryNumber;
  nextYear.previousFiscalYear = year.fiscalYear;
  await nextYear.save();

  return {
    openingJournalEntry: openingEntry.entryNumber,
    nextFiscalYear: nextYear,
  };
};

const executeYearEndClose = async ({ fiscalYear, user = null }) => {
  const validation = await fiscalYearService.validateFiscalYear({
    fiscalYear,
    user,
    mode: "yearEndClose",
  });

  if (!validation.passed) {
    throw new Error("Fiscal year cannot be closed because year-end validation failed.");
  }

  const openingBalanceResult = await generateOpeningBalances({
    fiscalYear,
    user,
  });

  const year = await FiscalYear.findOne({ fiscalYear: Number(fiscalYear) });

  year.status = "Closed";
  year.allowPosting = false;
  year.yearEndCompleted = true;
  year.yearEndCompletedAt = new Date();
  year.yearEndCompletedBy = getUserName(user);
  year.closedAt = new Date();
  year.closedBy = getUserName(user);
  year.validationStatus = "Passed";

  await year.save();

  return {
    year,
    validation,
    openingBalanceResult,
  };
};

module.exports = {
  executeYearEndClose,
  generateOpeningBalances,
};