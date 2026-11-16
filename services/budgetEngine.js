const Budget = require("../models/Budget");
const ChartOfAccount = require("../models/ChartOfAccount");
const GeneralLedgerTransaction = require(
  "../models/GeneralLedgerTransaction"
);

const T = require("./taxControl");

const roundMoney = T.round;

const getBudgetRange = ({
  budgetYear,
  budgetMonth,
  frequency = "Monthly",
}) => {
  const year = Number(budgetYear);
  const month = Number(budgetMonth);

  const months = {
    Monthly: 1,
    Quarterly: 3,
    Yearly: 12,
  }[frequency];

  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !months
  ) {
    T.fail(
      "Supply a valid starting year, month, and frequency."
    );
  }

  return {
    periodStart:
      `${year}-${String(month).padStart(2, "0")}-01`,

    periodEnd: new Date(
      Date.UTC(year, month - 1 + months, 0, 12)
    )
      .toISOString()
      .slice(0, 10),
  };
};

const getMonthFromDate = (value) => {
  let text;

  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    text = T.date(value);
  } else {
    const date = value
      ? new Date(value)
      : new Date();

    if (!Number.isFinite(date.getTime())) {
      T.fail("Posting date is invalid.");
    }

    const parts = new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "America/Jamaica",
        year: "numeric",
        month: "2-digit",
      }
    ).formatToParts(date);

    text =
      parts.find((part) => part.type === "year").value +
      "-" +
      parts.find((part) => part.type === "month").value;
  }

  return {
    budgetYear: Number(text.slice(0, 4)),
    budgetMonth: Number(text.slice(5, 7)),
  };
};

const calculateVariance = ({
  category,
  budgetType,
  plannedAmount,
  actualAmount,
}) => {
  if (actualAmount === null || actualAmount === undefined) {
    return null;
  }

  const revenue =
    budgetType === "Revenue" ||
    category === "Revenue";

  return roundMoney(
    revenue
      ? actualAmount - plannedAmount
      : plannedAmount - actualAmount
  );
};

const calculateVariancePercent = ({
  plannedAmount,
  variance,
}) =>
  variance === null || Number(plannedAmount) <= 0
    ? null
    : roundMoney(
        (variance / Number(plannedAmount)) * 100
      );

const evaluateBudget = async (budget) => {
  const source =
    typeof budget.toObject === "function"
      ? budget.toObject()
      : budget;

  const range = getBudgetRange(source);

  const result = {
    ...source,
    ...range,
    actualAmount: null,
    variance: null,
    variancePercent: null,
    ledgerRowCount: 0,
    comparisonStatus: "Unavailable",
    comparisonNote: "",
    overlapWarning: false,
  };

  const unavailable = (note) => ({
    ...result,
    comparisonNote: note,
  });

  if (!source.entityCode) {
    return unavailable(
      "Business attribution requires review."
    );
  }

  if (source.currency !== "JMD") {
    return unavailable(
      "Currency is unconfirmed or unsupported. This comparison uses JMD ledger base amounts."
    );
  }

  if (
    !["Operating", "Revenue"].includes(source.budgetType)
  ) {
    return unavailable(
      "Planning only. Capital purchases, loan repayments, and cash movements require separate measurement rules."
    );
  }

  if (
    source.costCenter &&
    source.costCenter !== "General"
  ) {
    return unavailable(
      "The ledger does not provide a consistent cost-center field for this comparison."
    );
  }

  if (!source.linkedChartAccountCode) {
    return unavailable(
      "Select a specific ledger account. Category-name matching is not used."
    );
  }

  const account = await ChartOfAccount.findOne({
    accountCode: source.linkedChartAccountCode,
  }).lean();

  const revenue = source.budgetType === "Revenue";

  if (
    !account ||
    (
      revenue
        ? account.accountCategory !== "Revenue"
        : !["Expense", "Cost of Sales"].includes(
            account.accountCategory
          )
    )
  ) {
    return unavailable(
      "The mapped account does not match the budget type."
    );
  }

  const rows = await GeneralLedgerTransaction.find({
    accountCode: source.linkedChartAccountCode,

    entryDate: {
      $gte: range.periodStart,
      $lte: range.periodEnd,
    },

    $or: [
      { entityCode: source.entityCode },
      { entityCode: "" },
      { entityCode: null },
    ],
  })
    .select(
      "entityCode branch debit credit entryDate"
    )
    .lean();

  if (rows.some((row) => !row.entityCode)) {
    return unavailable(
      "Ledger activity for this account and period has missing business attribution."
    );
  }

  const branch = source.branch || "All Branches";

  if (
    branch !== "All Branches" &&
    rows.some(
      (row) =>
        !row.branch ||
        row.branch === "All Branches"
    )
  ) {
    return unavailable(
      "Some ledger activity has no specific branch. A branch-only actual cannot be established."
    );
  }

  const matched =
    branch === "All Branches"
      ? rows
      : rows.filter(
          (row) => row.branch === branch
        );

  let actual = 0;

  try {
    for (const row of matched) {
      const debit = T.amount(row.debit ?? 0);
      const credit = T.amount(row.credit ?? 0);

      actual += revenue
        ? credit - debit
        : debit - credit;
    }
  } catch {
    return unavailable(
      "Ledger debit or credit amounts require review."
    );
  }

  result.actualAmount = roundMoney(actual);
  result.ledgerRowCount = matched.length;

  if (!matched.length) {
    result.comparisonStatus = "No ledger activity";

    result.comparisonNote =
      "Zero recorded activity does not establish zero business activity. No savings or performance rating is inferred.";

    return result;
  }

  result.variance = calculateVariance({
    ...source,
    actualAmount: result.actualAmount,
  });

  result.variancePercent =
    calculateVariancePercent({
      plannedAmount: source.plannedAmount,
      variance: result.variance,
    });

  result.comparisonStatus =
    "Recorded ledger comparison";

  result.comparisonNote =
    "Includes recorded debits, credits, and reversals. Completeness has not been established; variance is not available cash.";

  return result;
};

const markOverlaps = (rows) => {
  for (let first = 0; first < rows.length; first += 1) {
    for (
      let second = first + 1;
      second < rows.length;
      second += 1
    ) {
      const a = rows[first];
      const b = rows[second];

      const sharedBranch =
        a.branch === "All Branches" ||
        b.branch === "All Branches" ||
        a.branch === b.branch;

      if (
        a.linkedChartAccountCode &&
        a.entityCode === b.entityCode &&
        a.currency === b.currency &&
        a.linkedChartAccountCode ===
          b.linkedChartAccountCode &&
        a.budgetType === b.budgetType &&
        sharedBranch &&
        a.periodStart <= b.periodEnd &&
        b.periodStart <= a.periodEnd
      ) {
        a.overlapWarning = true;
        b.overlapWarning = true;
      }
    }
  }

  return rows;
};

// Compatibility exports for existing posting callers.
// Budget reports now read the ledger; posting must not
// increment stored budget actuals as a second source.
const applyActualToBudgets = async () => [];

const refreshBudgetVariance = async (budget) =>
  evaluateBudget(budget);

const findMatchingBudgets = async ({
  accountCode = "",
  postingDate,
}) => {
  if (!accountCode) return [];

  const { budgetYear, budgetMonth } =
    getMonthFromDate(postingDate);

  return Budget.find({
    linkedChartAccountCode: accountCode,
    budgetYear,
    budgetMonth,
    status: "Active",
  });
};

module.exports = {
  getBudgetRange,
  getMonthFromDate,
  calculateVariance,
  calculateVariancePercent,
  evaluateBudget,
  markOverlaps,
  refreshBudgetVariance,
  findMatchingBudgets,
  applyActualToBudgets,
};