const mongoose = require("mongoose");

const AccountingPeriod = require("../../models/AccountingPeriod");
const JournalEntry = require("../../models/JournalEntry");
const FiscalYear = require("../../models/FiscalYear");

const {
  buildReportBundle,
  jamaicaDate,
} = require("./reportingService");

const fail = (message, statusCode = 409) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const actor = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const text = (value, label, required = false) => {
  if (value === undefined || value === null) value = "";

  if (typeof value !== "string" || value.length > 2000) {
    fail(`${label} must be text of no more than 2,000 characters.`, 400);
  }

  const result = value.trim();

  if (required && !result) {
    fail(`${label} is required.`, 400);
  }

  return result;
};

const getPeriod = async (periodNumber, session = null) => {
  const period = await AccountingPeriod.findOne({
    periodNumber: text(periodNumber, "Period number", true),
  }).session(session);

  if (!period) fail("Accounting period not found.", 404);

  return period;
};

const getPeriodByDate = async (entryDate) => {
  const day =
    entryDate instanceof Date
      ? jamaicaDate(entryDate)
      : String(entryDate || "");

  const parsed = new Date(`${day}T00:00:00Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== day
  ) {
    fail("Enter a valid accounting date.", 400);
  }

  return AccountingPeriod.findOne({
    fiscalYear: parsed.getUTCFullYear(),
    periodMonth: parsed.getUTCMonth() + 1,
  });
};

const getCurrentPeriod = async () =>
  getPeriodByDate(jamaicaDate(new Date()));

const syncFiscalYearCounters = async (fiscalYear, session) => {
  const periods = await AccountingPeriod.find({
    fiscalYear,
  }).session(session);

  await FiscalYear.findOneAndUpdate(
    { fiscalYear },
    {
      $set: {
        openPeriods: periods.filter((period) =>
          ["Open", "Closing"].includes(period.status)
        ).length,
        closedPeriods: periods.filter(
          (period) => period.status === "Closed"
        ).length,
        lockedPeriods: periods.filter(
          (period) => period.status === "Locked"
        ).length,
      },
    },
    { session }
  );
};

const findLegacyClosingJournals = async (period, session = null) => {
  const references = [
    period.closingJournalEntry,
    period.retainedEarningsJournal,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  const conditions = [
    {
      entryDate: {
        $gte: period.startDate,
        $lte: period.endDate,
      },
      $or: [
        {
          sourceModule: {
            $in: [
              "Period Closing",
              "Year End Closing",
              "Year-End Closing",
              "Year-End Opening Balance",
            ],
          },
        },
        {
          reference: /^(PERIOD-CLOSE-|YEAR-END-|OPENING-)/,
        },
      ],
    },
  ];

  if (references.length) {
    conditions.push({
      entryNumber: { $in: references },
    });
  }

  return JournalEntry.find({ $or: conditions })
    .select(
      "entryNumber entryDate reference sourceModule status totalDebit totalCredit"
    )
    .sort({ entryDate: 1, entryNumber: 1 })
    .session(session)
    .lean();
};

const checkLegacyClosing = async (period, session = null) =>
  Boolean(
    period.closingJournalEntry ||
      period.retainedEarningsJournal ||
      (await findLegacyClosingJournals(period, session)).length
  );

const evaluatePeriod = async (period, session = null) => {
  try {
    await period.validate();
  } catch (error) {
    return {
      period,
      passed: false,
      readyToClose: false,
      checklist: {},
      errors: [error.message],
      warnings: [],
      summary: {},
    };
  }

  const bundle = await buildReportBundle({
    from: period.startDate,
    to: period.endDate,
  });

  const unpostedCount = await JournalEntry.countDocuments({
    entryDate: {
      $gte: period.startDate,
      $lte: period.endDate,
    },
    status: {
      $nin: ["Posted", "Reversed"],
    },
  }).session(session);

  const legacyClosingJournals =
    await findLegacyClosingJournals(period, session);

  const legacyClosing = Boolean(
    period.closingJournalEntry ||
      period.retainedEarningsJournal ||
      legacyClosingJournals.length
  );

  const errors = [];
  const warnings = bundle.diagnostics.issues.map(
    (issue) => `${issue.message} Count: ${issue.count}.`
  );

  if (!bundle.trialBalance.totals.isBalanced) {
    errors.push(
      `Trial Balance difference: ${bundle.trialBalance.totals.difference} JMD.`
    );
  }

  if (!bundle.balanceSheet.totals.isBalanced) {
    errors.push(
      `Balance Sheet difference: ${bundle.balanceSheet.totals.difference} JMD.`
    );
  }

  if (unpostedCount) {
    errors.push(
      `${unpostedCount} journal(s) are not Posted or Reversed.`
    );
  }

  const blockingCodes = new Set([
    "INVALID_LEDGER_DATE",
    "INVALID_LEDGER_AMOUNT",
    "ORPHAN_LEDGER",
    "UNPOSTED_JOURNAL_LEDGER",
    "MISSING_CHART_ACCOUNT",
    "CATEGORY_MISMATCH",
    "POSTING_DATE_MISMATCH",
  ]);

  for (const issue of bundle.diagnostics.issues) {
    if (blockingCodes.has(issue.code)) {
      errors.push(`${issue.code}: ${issue.message}`);
    }
  }

  if (legacyClosing) {
    errors.push(
      "Existing closing/opening journal references require review. They will not be repeated or reversed automatically."
    );
  }

  if (period.endDate >= jamaicaDate(new Date())) {
    errors.push(
      "Close a period only after its ending date has passed."
    );
  }

  warnings.push(
    "Bank reconciliation and depreciation completeness have not been automatically verified.",
    "Passing these checks does not prove that all business activity has been recorded.",
    "Monthly closing blocks posting; it does not create revenue, expense, or retained-earnings transfer journals."
  );

  const checklist = {
    trialBalanceBalanced: bundle.trialBalance.totals.isBalanced,
    balanceSheetBalanced: bundle.balanceSheet.totals.isBalanced,
    profitAndLossGenerated: true,
    balanceSheetGenerated: true,
    allJournalEntriesPosted: unpostedCount === 0,
    noDraftJournals: unpostedCount === 0,
    noUnreconciledBankAccounts: null,
    depreciationPosted: null,
  };

  const passed = errors.length === 0;

  return {
    period,
    passed,
    readyToClose:
      passed && ["Open", "Closing"].includes(period.status),
    checklist,
    errors,
    warnings,
    summary: {
      scope: "System-wide: all businesses and branches",
      legacyClosingJournals,
      legacyClosingReferences: [
        period.closingJournalEntry,
        period.retainedEarningsJournal,
      ].filter(Boolean),
      trialBalance: bundle.trialBalance.totals,
      balanceSheet: bundle.balanceSheet.totals,
      profitAndLoss: {
        totalRevenue: bundle.profitAndLoss.revenue.total,
        totalCostOfSales: bundle.profitAndLoss.costOfSales.total,
        totalOperatingExpenses:
          bundle.profitAndLoss.operatingExpenses.total,
        grossProfit: bundle.profitAndLoss.grossProfit,
        netProfit: bundle.profitAndLoss.netProfit,
      },
      unpostedCount,
      ledgerLineCount: bundle.diagnostics.ledgerLineCount,
      issues: bundle.diagnostics.issues,
    },
  };
};

// Viewing checks never changes period status or stored validation.
const validatePeriod = async ({ periodNumber } = {}) =>
  evaluatePeriod(await getPeriod(periodNumber));

const buildCloseChecklist = validatePeriod;

const changePeriod = async ({
  periodNumber,
  action,
  reason,
  user,
}) =>
  mongoose.connection.transaction(async (session) => {
    const period = await getPeriod(periodNumber, session);
    const previousStatus = period.status;

    const year = await FiscalYear.findOne({
      fiscalYear: period.fiscalYear,
    }).session(session);

    if (action === "CLOSE") {
      if (!["Open", "Closing"].includes(period.status)) {
        fail("Only Open or Closing periods can be closed.");
      }

      if (
        year &&
        (
          year.allowPosting === false ||
          year.status !== "Open"
        )
      ) {
        fail(
          "The fiscal year is blocked. Review it before closing this period."
        );
      }

      // Journal posting also writes to this period document.
      period.status = "Closing";
      period.allowPosting = false;
      period.postingRevision =
        Number(period.postingRevision || 0) + 1;

      await period.save({ session });

      const result = await evaluatePeriod(period, session);

      if (!result.passed) {
        fail(`Period cannot close: ${result.errors.join(" ")}`);
      }

      period.status = "Closed";
      period.closedAt = new Date();
      period.closedBy = actor(user);
      period.validationStatus = "Passed";
      period.validationErrors = [];
      period.validationWarnings = result.warnings;
      period.validationSummary = result.summary;
      period.validatedAt = new Date();
      period.validatedBy = actor(user);

      period.checklist.trialBalanceBalanced =
        result.checklist.trialBalanceBalanced;
      period.checklist.profitAndLossGenerated = true;
      period.checklist.balanceSheetGenerated = true;
      period.checklist.allJournalEntriesPosted = true;
      period.checklist.noDraftJournals = true;
      period.checklist.noUnreconciledBankAccounts = null;
      period.checklist.depreciationPosted = null;
      period.checklist.closingJournalCreated = false;
    } else if (action === "LOCK") {
      if (period.status !== "Closed") {
        fail("Only a Closed period can be locked.");
      }

      period.status = "Locked";
      period.allowPosting = false;
      period.lockedAt = new Date();
      period.lockedBy = actor(user);
    } else if (action === "REOPEN") {
      if (!["Closing", "Closed", "Locked"].includes(period.status)) {
        fail("This accounting period is already Open.");
      }

      if (
        year &&
        (
          year.allowPosting === false ||
          year.status !== "Open"
        )
      ) {
        fail(
          "Reopen the fiscal year before reopening this period."
        );
      }

      if (await checkLegacyClosing(period, session)) {
        fail(
          "This period contains closing/opening journal references. Review their correction before reopening."
        );
      }

      period.status = "Open";
      period.allowPosting = true;
      period.reopenedAt = new Date();
      period.reopenedBy = actor(user);
      period.reopenedReason = reason;
      period.validationStatus = "Not Validated";
      period.validationSummary = {};
      period.validationErrors = [];
      period.validationWarnings = [
        "Reopened: previous validation is historical. Recheck after corrections.",
      ];
      period.validatedAt = null;
      period.validatedBy = "";
      period.checklist = {
        noUnreconciledBankAccounts: null,
        depreciationPosted: null,
      };
    } else {
      fail("Unknown accounting period action.", 400);
    }

    period.postingRevision =
      Number(period.postingRevision || 0) + 1;

    period.controlHistory.push({
      action,
      at: new Date(),
      by: actor(user),
      reason,
      previousStatus,
      newStatus: period.status,
    });

    if (reason) period.notes = reason;

    await period.save({ session });
    await syncFiscalYearCounters(period.fiscalYear, session);

    return period;
  });

const closePeriod = ({ periodNumber, notes = "", user }) =>
  changePeriod({
    periodNumber,
    action: "CLOSE",
    reason: text(notes, "Closing notes"),
    user,
  });

const lockPeriod = ({ periodNumber, notes = "", user }) =>
  changePeriod({
    periodNumber,
    action: "LOCK",
    reason: text(notes, "Locking notes"),
    user,
  });

const reopenPeriod = ({ periodNumber, reason = "", user }) =>
  changePeriod({
    periodNumber,
    action: "REOPEN",
    reason: text(reason, "Reopening reason", true),
    user,
  });

module.exports = {
  getPeriodByDate,
  getCurrentPeriod,
  validatePeriod,
  buildCloseChecklist,
  closePeriod,
  lockPeriod,
  reopenPeriod,
};