const mongoose = require("mongoose");

const FiscalYear = require("../../models/FiscalYear");
const AccountingPeriod = require("../../models/AccountingPeriod");
const JournalEntry = require("../../models/JournalEntry");

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

const parseYear = (value) => {
  if (
    !["string", "number"].includes(typeof value) ||
    !/^\d{4}$/.test(String(value))
  ) {
    fail("Enter a four-digit fiscal year.", 400);
  }

  const year = Number(value);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    fail("Enter a year from 2000 to 2100.", 400);
  }

  return year;
};

const cleanText = (value = "") => {
  if (typeof value !== "string" || value.length > 2000) {
    fail("Notes must be text of no more than 2,000 characters.", 400);
  }

  return value.trim();
};

const addHistory = (document, action, user, reason, previousStatus) => {
  document.controlHistory.push({
    action,
    at: new Date(),
    by: actor(user),
    reason,
    previousStatus,
    newStatus: document.status,
  });

  document.controlRevision =
    Number(document.controlRevision || 0) + 1;
};

const findYear = async (value, session = null) => {
  const year = await FiscalYear.findOne({
    fiscalYear: parseYear(value),
  }).session(session);

  if (!year) fail("Fiscal year not found.", 404);

  return year;
};

const monthDates = (year, month) => {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    startDate: `${prefix}-01`,
    endDate: `${prefix}-${lastDay}`,
  };
};

const buildFiscalYearStats = async (fiscalYear, session = null) => {
  const periods = await AccountingPeriod.find({
    fiscalYear: parseYear(fiscalYear),
  })
    .sort({ periodMonth: 1 })
    .session(session);

  return {
    periods,
    totalPeriodsFound: periods.length,
    openPeriods: periods.filter((p) => p.status === "Open").length,
    closingPeriods: periods.filter((p) => p.status === "Closing").length,
    closedPeriods: periods.filter((p) => p.status === "Closed").length,
    lockedPeriods: periods.filter((p) => p.status === "Locked").length,
    incompletePeriods: periods.filter(
      (p) =>
        !["Closed", "Locked"].includes(p.status) ||
        p.allowPosting !== false
    ),
    // Retained for compatibility. Monthly closing journals are not required.
    periodsMissingClosingJournal: [],
  };
};

const setCounters = (year, stats) => {
  year.openPeriods = stats.openPeriods + stats.closingPeriods;
  year.closedPeriods = stats.closedPeriods;
  year.lockedPeriods = stats.lockedPeriods;
};

const prepareMonths = async (year, user, session) => {
  const created = [];

  for (let month = 1; month <= 12; month += 1) {
    const dates = monthDates(year.fiscalYear, month);

    const existing = await AccountingPeriod.findOne({
      fiscalYear: year.fiscalYear,
      periodMonth: month,
    }).session(session);

    if (existing) {
      if (
        existing.startDate !== dates.startDate ||
        existing.endDate !== dates.endDate
      ) {
        fail(
          `Existing period ${existing.periodNumber} has inconsistent dates. Review it before preparing this year.`
        );
      }

      // Preserve existing period status, history, and posting settings.
      continue;
    }

    if (year.status !== "Open" || year.allowPosting !== true) {
      fail("Missing monthly periods cannot be added to a blocked fiscal year.");
    }

    const monthName = new Intl.DateTimeFormat("en-US", {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${dates.startDate}T00:00:00Z`));

    const documents = await AccountingPeriod.create(
      [
        {
          periodNumber:
            `PER-${year.fiscalYear}-${String(month).padStart(2, "0")}`,
          fiscalYear: year.fiscalYear,
          periodMonth: month,
          periodName: `${monthName} ${year.fiscalYear}`,
          ...dates,
          status: "Open",
          allowPosting: true,
          notes: `Prepared for FY ${year.fiscalYear}`,
          controlHistory: [
            {
              action: "CREATE",
              at: new Date(),
              by: actor(user),
              reason: "Monthly period prepared with fiscal year.",
              previousStatus: "",
              newStatus: "Open",
            },
          ],
        },
      ],
      { session }
    );

    created.push(documents[0]);
  }

  setCounters(
    year,
    await buildFiscalYearStats(year.fiscalYear, session)
  );

  return created;
};

const createWithinSession = async ({
  fiscalYear,
  notes = "",
  user,
  session,
}) => {
  const value = parseYear(fiscalYear);

  if (await FiscalYear.exists({ fiscalYear: value }).session(session)) {
    fail("Fiscal year already exists.");
  }

  const overlap = await FiscalYear.exists({
    startDate: { $lte: `${value}-12-31` },
    endDate: { $gte: `${value}-01-01` },
  }).session(session);

  if (overlap) fail("Another fiscal year overlaps these dates.");

  const documents = await FiscalYear.create(
    [
      {
        fiscalYear: value,
        yearName: `FY ${value}`,
        startDate: `${value}-01-01`,
        endDate: `${value}-12-31`,
        totalPeriods: 12,
        status: "Open",
        allowPosting: true,
        notes: cleanText(notes),
        createdBy: actor(user),
        isCurrentYear: false,
      },
    ],
    { session }
  );

  const year = documents[0];

  await prepareMonths(year, user, session);
  addHistory(year, "CREATE", user, cleanText(notes), "");
  await year.save({ session });

  return year;
};

const createFiscalYear = async (options) => {
  const value = parseYear(options.fiscalYear);

  if (
    (options.startDate !== undefined &&
      options.startDate !== `${value}-01-01`) ||
    (options.endDate !== undefined &&
      options.endDate !== `${value}-12-31`) ||
    (options.totalPeriods !== undefined &&
      Number(options.totalPeriods) !== 12)
  ) {
    fail("Use January 1 to December 31 with 12 monthly periods.", 400);
  }

  return mongoose.connection.transaction((session) =>
    createWithinSession({ ...options, fiscalYear: value, session })
  );
};

const createAccountingPeriodsForYear = async ({
  fiscalYear,
  user = null,
}) =>
  mongoose.connection.transaction(async (session) => {
    const year = await findYear(fiscalYear, session);
    const created = await prepareMonths(year, user, session);

    addHistory(
      year,
      "PREPARE_PERIODS",
      user,
      `${created.length} missing monthly periods prepared.`,
      year.status
    );

    await year.save({ session });
    return created;
  });

const evaluateYear = async (year, mode, session = null) => {
  if (!["progress", "yearEndClose"].includes(mode)) {
    fail("Select progress or yearEndClose validation.", 400);
  }

  const errors = [];
  const warnings = [];
  const readinessErrors = [];

  try {
    await year.validate();
  } catch (error) {
    fail(`Fiscal year configuration needs review: ${error.message}`, 400);
  }

  const stats = await buildFiscalYearStats(year.fiscalYear, session);

  const missingMonths = [];
  const invalidPeriods = [];

  for (let month = 1; month <= 12; month += 1) {
    const matches = stats.periods.filter((p) => p.periodMonth === month);
    const dates = monthDates(year.fiscalYear, month);

    if (!matches.length) {
      missingMonths.push(month);
    } else if (
      matches.length !== 1 ||
      matches[0].startDate !== dates.startDate ||
      matches[0].endDate !== dates.endDate
    ) {
      invalidPeriods.push(month);
    }
  }

  if (invalidPeriods.length || stats.totalPeriodsFound > 12) {
    errors.push("Monthly period dates or numbering are inconsistent.");
  }

  if (missingMonths.length) {
    readinessErrors.push(`Missing monthly periods: ${missingMonths.join(", ")}.`);
  }

  if (stats.incompletePeriods.length) {
    readinessErrors.push(
      `${stats.incompletePeriods.length} monthly period(s) are not Closed/Locked with posting blocked.`
    );
  }

  if (year.endDate >= jamaicaDate(new Date())) {
    readinessErrors.push("The fiscal year has not yet ended.");
  }

  const bundle = await buildReportBundle({
    from: year.startDate,
    to: year.endDate,
  });

  const unpostedCount = await JournalEntry.countDocuments({
    entryDate: { $gte: year.startDate, $lte: year.endDate },
    status: { $nin: ["Posted", "Reversed"] },
  }).session(session);

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
    errors.push(`${unpostedCount} journal(s) are not Posted or Reversed.`);
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
    warnings.push(`${issue.code}: ${issue.message} Count: ${issue.count}.`);

    if (blockingCodes.has(issue.code)) {
      errors.push(`${issue.code}: review the reporting finding.`);
    }
  }

  const legacyJournal = await JournalEntry.exists({
    $or: [
      {
        entryDate: { $gte: year.startDate, $lte: year.endDate },
        sourceModule: {
          $in: ["Period Closing", "Year-End Opening Balance"],
        },
      },
      {
        entryDate: `${year.fiscalYear + 1}-01-01`,
        sourceModule: "Year-End Opening Balance",
      },
    ],
  }).session(session);

  if (
    legacyJournal ||
    year.openingJournalEntry ||
    year.closingJournalEntry ||
    year.retainedEarningsJournal ||
    stats.periods.some(
      (p) => p.closingJournalEntry || p.retainedEarningsJournal
    )
  ) {
    readinessErrors.push(
      "Existing closing/opening journal references require explicit review. They will not be repeated, deleted, or reversed automatically."
    );
  }

  warnings.push(
    "Recorded balances do not establish completeness or bank reconciliation.",
    "Monthly closing journals are not required.",
    "Balances continue through the cumulative ledger; no rollover journal is needed.",
    "Annual posting closure is not confirmation that tax filings, source records, or accountant review are complete."
  );

  const allReadinessErrors = [...errors, ...readinessErrors];

  const resultErrors =
    mode === "yearEndClose" ? allReadinessErrors : errors;

  if (mode === "progress") {
    warnings.push(...readinessErrors);
  }

  return {
    year,
    passed: resultErrors.length === 0,
    readyForYearEndClose:
      allReadinessErrors.length === 0 &&
      ["Open", "Closing"].includes(year.status),
    operationalValidationPassed:
      mode === "progress" && errors.length === 0,
    errors: resultErrors,
    warnings,
    summary: {
      validationMode: mode,
      fiscalYear: year.fiscalYear,
      startDate: year.startDate,
      endDate: year.endDate,
      scope: "All businesses and branches",
      periodStats: {
        totalPeriodsExpected: 12,
        totalPeriodsFound: stats.totalPeriodsFound,
        openPeriods: stats.openPeriods,
        closingPeriods: stats.closingPeriods,
        closedPeriods: stats.closedPeriods,
        lockedPeriods: stats.lockedPeriods,
        missingMonths,
        invalidPeriods,
      },
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
      journals: { unpostedCount },
      yearEndReadinessErrors: allReadinessErrors,
    },
  };
};

// Read-only checks: viewing validation does not save or change status.
const validateFiscalYear = async ({
  fiscalYear,
  mode = "progress",
}) =>
  evaluateYear(await findYear(fiscalYear), mode);

const closeFiscalYear = async ({ fiscalYear, user = null }) =>
  mongoose.connection.transaction(async (session) => {
    const year = await findYear(fiscalYear, session);

    if (!["Open", "Closing"].includes(year.status)) {
      fail("Only Open or Closing fiscal years can be closed.");
    }

    const previousStatus = year.status;

    year.status = "Closing";
    year.allowPosting = false;
    year.controlRevision = Number(year.controlRevision || 0) + 1;
    await year.save({ session });

    // Fence changes to every monthly period as well as the fiscal year.
    await AccountingPeriod.updateMany(
      { fiscalYear: year.fiscalYear },
      { $inc: { postingRevision: 1 } },
      { session }
    );

    const validation = await evaluateYear(
      year,
      "yearEndClose",
      session
    );

    if (!validation.passed) {
      fail(`Fiscal year cannot close: ${validation.errors.join(" ")}`);
    }

    year.status = "Closed";
    year.allowPosting = false;
    year.closedAt = new Date();
    year.closedBy = actor(user);
    year.validationStatus = "Passed";
    year.validationSummary = validation.summary;
    year.validationErrors = [];
    year.validationWarnings = validation.warnings;
    year.validatedAt = new Date();
    year.validatedBy = actor(user);

    // This action confirms posting closure, not all year-end work.
    year.yearEndCompleted = false;
    year.yearEndCompletedAt = null;
    year.yearEndCompletedBy = "";

    addHistory(
      year,
      "CLOSE_POSTING",
      user,
      "Annual posting closed; no opening or income-transfer journals created.",
      previousStatus
    );

    await year.save({ session });
    return year;
  });

const lockFiscalYear = async ({ fiscalYear, user = null }) =>
  mongoose.connection.transaction(async (session) => {
    const year = await findYear(fiscalYear, session);

    if (year.status !== "Closed" || year.allowPosting !== false) {
      fail("Only a Closed fiscal year with posting blocked can be locked.");
    }

    const stats = await buildFiscalYearStats(year.fiscalYear, session);

    if (
      stats.totalPeriodsFound !== 12 ||
      stats.incompletePeriods.length
    ) {
      fail("All 12 monthly periods must remain Closed or Locked.");
    }

    await AccountingPeriod.updateMany(
      { fiscalYear: year.fiscalYear },
      { $inc: { postingRevision: 1 } },
      { session }
    );

    year.status = "Locked";
    year.allowPosting = false;
    year.lockedAt = new Date();
    year.lockedBy = actor(user);

    addHistory(
      year,
      "LOCK",
      user,
      "Annual posting controls locked.",
      "Closed"
    );

    await year.save({ session });
    return year;
  });

const createNextFiscalYear = async ({ fiscalYear, user = null }) =>
  mongoose.connection.transaction(async (session) => {
    const source = await findYear(fiscalYear, session);
    const nextValue = parseYear(source.fiscalYear + 1);

    let next = await FiscalYear.findOne({
      fiscalYear: nextValue,
    }).session(session);

    if (!next) {
      next = await createWithinSession({
        fiscalYear: nextValue,
        notes: `Prepared from FY ${source.fiscalYear}.`,
        user,
        session,
      });
    } else {
      await next.validate();
      await prepareMonths(next, user, session);
    }

    // Preparing a year must not alter protected historical years.
    if (source.status === "Open") {
      source.nextFiscalYear = nextValue;
      addHistory(
        source,
        "PREPARE_NEXT",
        user,
        `FY ${nextValue} prepared without posting balances or changing current-year selection.`,
        source.status
      );
      await source.save({ session });
    }

    if (next.status === "Open") {
      next.previousFiscalYear = source.fiscalYear;
      addHistory(
        next,
        "PREPARE",
        user,
        "Monthly periods prepared; existing periods preserved.",
        next.status
      );
      await next.save({ session });
    }

    return next;
  });

const getFiscalYears = async () => {
  const years = await FiscalYear.find().sort({ fiscalYear: -1 }).lean();
  const current = Number(jamaicaDate(new Date()).slice(0, 4));

  for (const year of years) {
    const stats = await buildFiscalYearStats(year.fiscalYear);

    year.openPeriods = stats.openPeriods + stats.closingPeriods;
    year.closedPeriods = stats.closedPeriods;
    year.lockedPeriods = stats.lockedPeriods;
    year.totalPeriodsFound = stats.totalPeriodsFound;
    year.isCurrentYear = year.fiscalYear === current;
  }

  return years;
};

module.exports = {
  getFiscalYears,
  buildFiscalYearStats,
  validateFiscalYear,
  createFiscalYear,
  createAccountingPeriodsForYear,
  closeFiscalYear,
  lockFiscalYear,
  createNextFiscalYear,
};