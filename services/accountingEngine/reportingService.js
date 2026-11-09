const ChartOfAccount = require("../../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../../models/GeneralLedgerTransaction");
const JournalEntry = require("../../models/JournalEntry");
const FinancialAccount = require("../../models/FinancialAccount");

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const rejectFilter = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
};

const jamaicaDate = (value) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type).value)
    .join("-");
};

const dateOnly = (value) => {
  if (!value) return "";

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00Z`);

    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === text
      ? text
      : "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : jamaicaDate(date);
};

const canonicalBranch = (value) => {
  const branch = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/\s+/g, " ");

  if (
    [
      "eltham park",
      "eltham park mainstore",
      "eltham park main store",
    ].includes(branch)
  ) {
    return "Eltham Park Mainstore";
  }

  if (branch === "browns town square") {
    return "Brown's Town Square";
  }

  return "";
};

const resolveFilters = (options = {}) => {
  let from = String(options.from || "").trim();
  let to = String(options.to || "").trim();

  const today = jamaicaDate(new Date());

  if (!from && !to && options.filter) {
    to = today;

    switch (options.filter) {
      case "today":
        from = today;
        break;

      case "thisWeek": {
        const date = new Date(`${today}T00:00:00Z`);

        date.setUTCDate(
          date.getUTCDate() - ((date.getUTCDay() + 6) % 7)
        );

        from = date.toISOString().slice(0, 10);
        break;
      }

      case "thisMonth":
        from = `${today.slice(0, 7)}-01`;
        break;

      case "thisYear":
        from = `${today.slice(0, 4)}-01-01`;
        break;

      case "allTime":
        break;

      default:
        rejectFilter("Select a valid reporting period.");
    }
  }

  const validDate = (value) =>
    !value ||
    (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
      dateOnly(value) === value);

  if (!validDate(from) || !validDate(to)) {
    rejectFilter("Enter valid YYYY-MM-DD report dates.");
  }

  to = to || today;

  if (from && from > to) {
    rejectFilter(
      "The starting date must not be after the ending date."
    );
  }

  const branch = options.branch
    ? canonicalBranch(options.branch)
    : "";

  if (options.branch && !branch) {
    rejectFilter("Select one of the two official branches.");
  }

  return {
    from,
    to,
    branch,
    entityCode: String(options.entityCode || "").trim(),
    currency: "JMD",
    timeZone: "America/Jamaica",
  };
};

const ACCOUNT_CATEGORIES = [
  "Asset",
  "Liability",
  "Equity",
  "Revenue",
  "Cost of Sales",
  "Expense",
];

const sumMoney = (rows, getValue) =>
  roundMoney(
    rows.reduce((total, row) => total + getValue(row), 0)
  );

const buildReportBundle = async (options = {}) => {
  const filters = resolveFilters(options);

  const [accounts, rawLedger, journals, financialAccounts] =
    await Promise.all([
      ChartOfAccount.find().lean(),
      GeneralLedgerTransaction.find().lean(),
      JournalEntry.find().lean(),
      FinancialAccount.find().lean(),
    ]);

  const journalMap = new Map(
    journals.map((journal) => [journal.entryNumber, journal])
  );

  const accountMap = new Map(
    accounts.map((account) => [account.accountCode, account])
  );

  const issues = [];

  const warn = (code, message, count = 1) => {
    const existing = issues.find((issue) => issue.code === code);

    if (existing) {
      existing.count += count;
    } else {
      issues.push({ code, message, count });
    }
  };

  const scopedLedger = [];

  for (const line of rawLedger) {
    const day = dateOnly(line.entryDate);

    if (!day) {
      warn(
        "INVALID_LEDGER_DATE",
        "Ledger lines with missing or invalid posting dates were excluded and require review."
      );
      continue;
    }

    if (day > filters.to) continue;

    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);

    const validAmounts =
      Number.isFinite(debit) &&
      Number.isFinite(credit) &&
      Number.isSafeInteger(Math.round(debit * 100)) &&
      Number.isSafeInteger(Math.round(credit * 100));

    if (!line.accountCode || !validAmounts) {
      warn(
        "INVALID_LEDGER_AMOUNT",
        "Ledger lines with invalid amounts or account codes were excluded and require review."
      );
      continue;
    }

    if (
      debit < 0 ||
      credit < 0 ||
      (debit > 0 && credit > 0)
    ) {
      warn(
        "UNUSUAL_LEDGER_LINE",
        "Negative or two-sided ledger lines are included as recorded and need review."
      );
    }

    const journal = journalMap.get(line.entryNumber);

    const lineBranch = canonicalBranch(line.branch);
    const journalBranch = canonicalBranch(journal?.branch);
    const attributedBranch = lineBranch || journalBranch;

    if (
      lineBranch &&
      journalBranch &&
      lineBranch !== journalBranch
    ) {
      warn(
        "BRANCH_MISMATCH",
        "Ledger and journal branches disagree. The recorded ledger branch is used; review the source records."
      );
    }

    if (
      journal &&
      dateOnly(journal.entryDate) !== day
    ) {
      warn(
        "POSTING_DATE_MISMATCH",
        "Ledger and journal posting dates disagree. The ledger date is used; review the source records."
      );
    }

    const entityCode = String(
      line.entityCode || journal?.entityCode || ""
    ).trim();

    if (!attributedBranch) {
      warn(
        "UNASSIGNED_BRANCH",
        "Some ledger lines have no identifiable branch. They remain in All Branches but are excluded from a selected branch."
      );
    }

    if (!entityCode) {
      warn(
        "UNASSIGNED_ENTITY",
        "Some ledger lines have no business identity. They remain in the all-business view but cannot be assigned automatically."
      );
    }

    if (
      filters.branch &&
      attributedBranch !== filters.branch
    ) {
      continue;
    }

    if (
      filters.entityCode &&
      entityCode !== filters.entityCode
    ) {
      continue;
    }

    if (!journal) {
      warn(
        "ORPHAN_LEDGER",
        "Ledger lines without a matching journal are included as recorded and need reconciliation."
      );
    } else if (
      !["Posted", "Reversed"].includes(journal.status)
    ) {
      warn(
        "UNPOSTED_JOURNAL_LEDGER",
        "Ledger lines linked to a non-posted journal are included as recorded and need review."
      );
    }

    let account = accountMap.get(line.accountCode);

    if (!account) {
      account = {
        accountCode: line.accountCode,
        accountName: line.accountName || line.accountCode,
        accountCategory: ACCOUNT_CATEGORIES.includes(
          line.accountCategory
        )
          ? line.accountCategory
          : "Unclassified",
        accountType: "",
        normalBalance: line.normalBalance || "Debit",
        status: "Missing",
      };

      accountMap.set(line.accountCode, account);

      warn(
        "MISSING_CHART_ACCOUNT",
        "Ledger accounts missing from the chart are retained in the Trial Balance and require classification review."
      );
    }

    if (
      line.accountCategory &&
      line.accountCategory !== account.accountCategory
    ) {
      warn(
        "CATEGORY_MISMATCH",
        "Ledger category snapshots differ from current chart categories. Current chart categories are used; review historical classifications."
      );
    }

    scopedLedger.push({
      ...line,
      day,
      debit: roundMoney(debit),
      credit: roundMoney(credit),
      resolvedCategory: account.accountCategory,
    });
  }

  /*
   * Balances include all recorded activity through the ending date.
   * Movement fields contain only activity within the selected period.
   */

  const rowMap = new Map();

  for (const account of accountMap.values()) {
    rowMap.set(account.accountCode, {
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountCategory: account.accountCategory,
      accountType: account.accountType || "",
      normalBalance: account.normalBalance,
      status: account.status,
      debitTotal: 0,
      creditTotal: 0,
      movementDebit: 0,
      movementCredit: 0,
    });
  }

  for (const line of scopedLedger) {
    const row = rowMap.get(line.accountCode);

    row.debitTotal = roundMoney(
      row.debitTotal + line.debit
    );

    row.creditTotal = roundMoney(
      row.creditTotal + line.credit
    );

    if (!filters.from || line.day >= filters.from) {
      row.movementDebit = roundMoney(
        row.movementDebit + line.debit
      );

      row.movementCredit = roundMoney(
        row.movementCredit + line.credit
      );
    }
  }

  const rows = [...rowMap.values()]
    .map((row) => {
      const netDebit = roundMoney(
        row.debitTotal - row.creditTotal
      );

      return {
        ...row,
        naturalBalance:
          row.normalBalance === "Debit"
            ? netDebit
            : -netDebit,
        trialDebit: Math.max(netDebit, 0),
        trialCredit: Math.max(-netDebit, 0),
      };
    })
    .sort((a, b) =>
      a.accountCode.localeCompare(b.accountCode)
    );

  const totalDebits = sumMoney(
    rows,
    (row) => row.trialDebit
  );

  const totalCredits = sumMoney(
    rows,
    (row) => row.trialCredit
  );

  const trialDifference = roundMoney(
    totalDebits - totalCredits
  );

  /*
   * Profit and Loss: selected-period movement only.
   */

  const profitAccounts = (category, creditNormal) =>
    rows
      .filter((row) => row.accountCategory === category)
      .map((row) => ({
        accountCode: row.accountCode,
        accountName: row.accountName,
        amount: roundMoney(
          (row.movementDebit - row.movementCredit) *
            (creditNormal ? -1 : 1)
        ),
      }));

  const revenueAccounts = profitAccounts("Revenue", true);
  const costOfSalesAccounts = profitAccounts(
    "Cost of Sales",
    false
  );
  const expenseAccounts = profitAccounts("Expense", false);

  const totalRevenue = sumMoney(
    revenueAccounts,
    (row) => row.amount
  );

  const totalCostOfSales = sumMoney(
    costOfSalesAccounts,
    (row) => row.amount
  );

  const totalOperatingExpenses = sumMoney(
    expenseAccounts,
    (row) => row.amount
  );

  const profitAndLoss = {
    filters,
    revenue: {
      accounts: revenueAccounts,
      total: totalRevenue,
    },
    costOfSales: {
      accounts: costOfSalesAccounts,
      total: totalCostOfSales,
    },
    operatingExpenses: {
      accounts: expenseAccounts,
      total: totalOperatingExpenses,
    },
    grossProfit: roundMoney(
      totalRevenue - totalCostOfSales
    ),
    netProfit: roundMoney(
      totalRevenue -
        totalCostOfSales -
        totalOperatingExpenses
    ),
    diagnostics: {
      trialBalanceIsBalanced: trialDifference === 0,
      trialBalanceDifference: trialDifference,
    },
  };

  /*
   * Balance Sheet: cumulative balances through the ending date.
   */

  const balanceAccounts = (category, creditNormal) =>
    rows
      .filter((row) => row.accountCategory === category)
      .map((row) => ({
        accountCode: row.accountCode,
        accountName: row.accountName,
        accountType: row.accountType,
        amount: roundMoney(
          (row.trialDebit - row.trialCredit) *
            (creditNormal ? -1 : 1)
        ),
      }));

  const assets = balanceAccounts("Asset", false);
  const liabilities = balanceAccounts("Liability", true);
  const bookEquity = balanceAccounts("Equity", true);

  const cashCodes = new Set(
    [
      "1000",
      "1010",
      ...accounts
        .filter(
          (account) =>
            account.accountCategory === "Asset" &&
            ["Cash", "Bank"].includes(account.accountType)
        )
        .map((account) => account.accountCode),
      ...financialAccounts
        .filter((account) =>
          ["Cash", "Bank"].includes(account.accountType)
        )
        .map((account) => account.linkedChartAccountCode),
    ].filter(Boolean)
  );

  const cardCodes = new Set(
    financialAccounts
      .filter(
        (account) => account.accountType === "Credit Card"
      )
      .map((account) => account.linkedChartAccountCode)
  );

  const cashOnlyCodes = new Set(
    financialAccounts
      .filter((account) => account.accountType === "Cash")
      .map((account) => account.linkedChartAccountCode)
  );

  cashOnlyCodes.add("1000");

  const totalAssets = sumMoney(assets, (row) => row.amount);
  const totalLiabilities = sumMoney(
    liabilities,
    (row) => row.amount
  );
  const bookEquityTotal = sumMoney(
    bookEquity,
    (row) => row.amount
  );

  const unclosedEarnings = sumMoney(rows, (row) =>
    ["Revenue", "Expense", "Cost of Sales"].includes(
      row.accountCategory
    )
      ? row.trialCredit - row.trialDebit
      : 0
  );

  const equityAccounts = [...bookEquity];

  if (unclosedEarnings !== 0) {
    equityAccounts.push({
      accountCode: "UNCLOSED-EARNINGS",
      accountName: "Unclosed earnings in ledger",
      amount: unclosedEarnings,
    });
  }

  const totalEquity = roundMoney(
    bookEquityTotal + unclosedEarnings
  );

  const balanceSheetDifference = roundMoney(
    totalAssets - totalLiabilities - totalEquity
  );

  const amountForCode = (list, code) =>
    list.find((row) => row.accountCode === code)?.amount ??
    0;

  const currentValue = (list, isAsset) => {
    let total = 0;
    let unclassified = 0;

    for (const row of list) {
      const type = row.accountType
        .toLowerCase()
        .replace(/[-\s]/g, "");

      const isCurrent = isAsset
        ? cashCodes.has(row.accountCode) ||
          ["currentasset", "currenttaxreceivable"].includes(
            type
          )
        : cardCodes.has(row.accountCode) ||
          type === "currentliability";

      const isNonCurrent = isAsset
        ? [
            "noncurrentasset",
            "fixedasset",
            "longtermasset",
          ].includes(type)
        : [
            "noncurrentliability",
            "longtermliability",
          ].includes(type);

      if (isCurrent) {
        total += row.amount;
      } else if (!isNonCurrent && row.amount !== 0) {
        unclassified += 1;
      }
    }

    if (unclassified) {
      warn(
        isAsset
          ? "ASSET_CLASSIFICATION"
          : "LIABILITY_CLASSIFICATION",
        "Nonzero accounts lack an explicit current/non-current classification. Current totals and ratios are unavailable until reviewed.",
        unclassified
      );
    }

    return unclassified ? null : roundMoney(total);
  };

  const currentAssets = currentValue(assets, true);
  const currentLiabilities = currentValue(
    liabilities,
    false
  );

  const closingCash = sumMoney(assets, (row) =>
    cashCodes.has(row.accountCode) ? row.amount : 0
  );

  const balanceSheet = {
    filters,
    assets: {
      accounts: assets,
      total: totalAssets,
      totalAssets,
      cashOnHand: sumMoney(assets, (row) =>
        cashOnlyCodes.has(row.accountCode) ? row.amount : 0
      ),
      cashAndBank: closingCash,
      accountsReceivable: amountForCode(assets, "1100"),
      current: currentAssets,
    },
    liabilities: {
      accounts: liabilities,
      total: totalLiabilities,
      totalLiabilities,
      current: currentLiabilities,
    },
    equity: {
      accounts: equityAccounts,
      total: totalEquity,
      ownerEquity: totalEquity,
      ownerEquityOnly: bookEquityTotal,
      currentYearEarnings: unclosedEarnings,
    },
    totals: {
      totalAssets,
      totalLiabilities,
      ownerEquityOnly: bookEquityTotal,
      currentYearEarnings: unclosedEarnings,
      totalEquity,
      liabilitiesPlusEquity: roundMoney(
        totalLiabilities + totalEquity
      ),
      difference: balanceSheetDifference,
      isBalanced: balanceSheetDifference === 0,
    },
    diagnostics: {
      trialBalanceIsBalanced: trialDifference === 0,
      trialBalanceDifference: trialDifference,
      balanceSheetIsBalanced:
        balanceSheetDifference === 0,
    },
  };

  /*
   * Monthly graph: the same period and classifications as P&L.
   * Payroll is already included within expenses.
   */

  const periodLedger = scopedLedger.filter(
    (line) => !filters.from || line.day >= filters.from
  );

  const months = new Map();

  for (const line of periodLedger) {
    if (
      !["Revenue", "Expense", "Cost of Sales"].includes(
        line.resolvedCategory
      )
    ) {
      continue;
    }

    const month = line.day.slice(0, 7);

    if (!months.has(month)) {
      months.set(month, {
        month,
        revenue: 0,
        expenses: 0,
        payroll: 0,
        recordedActivity: false,
      });
    }

    const item = months.get(month);
    item.recordedActivity = true;

    if (line.accountCode === "6100") {
      item.payroll = roundMoney(
        item.payroll + line.debit - line.credit
      );
    }

    if (line.resolvedCategory === "Revenue") {
      item.revenue = roundMoney(
        item.revenue + line.credit - line.debit
      );
    } else {
      item.expenses = roundMoney(
        item.expenses + line.debit - line.credit
      );
    }
  }

  if (months.size) {
    let month = filters.from
      ? filters.from.slice(0, 7)
      : [...months.keys()].sort()[0];

    let filled = 0;

    while (
      month <= filters.to.slice(0, 7) &&
      filled < 600
    ) {
      if (!months.has(month)) {
        months.set(month, {
          month,
          revenue: 0,
          expenses: 0,
          payroll: 0,
          recordedActivity: false,
        });
      }

      const date = new Date(
        `${month}-01T00:00:00Z`
      );

      date.setUTCMonth(date.getUTCMonth() + 1);
      month = date.toISOString().slice(0, 7);
      filled += 1;
    }

    if (filled === 600) {
      warn(
        "LONG_CHART_RANGE",
        "The chart range is too long to fill every empty month. Narrow the dates for detailed trend analysis."
      );
    }
  }

  const monthlyTrend = [...months.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item) => ({
      ...item,
      income: item.revenue,
      net: roundMoney(item.revenue - item.expenses),
      netProfit: roundMoney(
        item.revenue - item.expenses
      ),
    }));

  /*
   * Cash movements.
   * Pure cash/bank transfers are shown separately.
   */

  const journalGroups = new Map();

  for (const line of periodLedger) {
    if (!journalGroups.has(line.entryNumber)) {
      journalGroups.set(line.entryNumber, []);
    }

    journalGroups.get(line.entryNumber).push(line);
  }

  const inflows = [];
  const outflows = [];

  let totalInflows = 0;
  let totalOutflows = 0;
  let internalTransfers = 0;
  let payrollPayments = 0;

  for (const [entryNumber, lines] of journalGroups) {
    const cashLines = lines.filter((line) =>
      cashCodes.has(line.accountCode)
    );

    const debit = sumMoney(
      cashLines,
      (line) => line.debit
    );

    const credit = sumMoney(
      cashLines,
      (line) => line.credit
    );

    if (!debit && !credit) continue;

    const allJournalLines = scopedLedger.filter(
      (line) => line.entryNumber === entryNumber
    );

    const pureTransfer =
      allJournalLines.every((line) =>
        cashCodes.has(line.accountCode)
      ) && debit === credit;

    if (pureTransfer) {
      internalTransfers = roundMoney(
        internalTransfers + debit
      );
      continue;
    }

    for (const line of cashLines) {
      if (line.debit) {
        inflows.push({ ...line, amount: line.debit });
      }

      if (line.credit) {
        outflows.push({ ...line, amount: line.credit });
      }
    }

    totalInflows = roundMoney(totalInflows + debit);
    totalOutflows = roundMoney(totalOutflows + credit);

    if (
      journalMap.get(entryNumber)?.sourceModule ===
      "Payroll"
    ) {
      payrollPayments = roundMoney(
        payrollPayments + credit - debit
      );
    }
  }

  const netCashFlow = roundMoney(
    totalInflows - totalOutflows
  );

  const openingCash = roundMoney(
    closingCash - netCashFlow
  );

  const cashFlow = {
    filters,
    inflows,
    outflows,
    cashAccounts: assets
      .filter((account) =>
        cashCodes.has(account.accountCode)
      )
      .map((account) => ({
        accountCode: account.accountCode,
        accountName: account.accountName,
        currentBalance: account.amount,
      })),
    totals: {
      totalInflows,
      totalOutflows,
      netCashFlow,
      openingBalance: openingCash,
      closingBalance: closingCash,
      internalTransfers,
    },
    totalCashInflows: totalInflows,
    totalCashOutflows: totalOutflows,
    netCashFlow,
    payrollPayments,
    diagnostics: {
      cashAccountCount: cashCodes.size,
      ledgerLineCount: periodLedger.filter((line) =>
        cashCodes.has(line.accountCode)
      ).length,
      classification:
        "Cash movements; operating/investing/financing classification not yet verified",
    },
  };

  if (
    scopedLedger.some(
      (line) => line.accountCode === "3900"
    )
  ) {
    warn(
      "CLOSING_REVIEW",
      "Income Summary activity exists. Closed-period profit presentation requires a separate closing-entry review."
    );
  }

  const creditCardOutstanding = sumMoney(
    liabilities,
    (row) =>
      cardCodes.has(row.accountCode) ? row.amount : 0
  );

  const activeCards = financialAccounts.filter(
    (account) =>
      account.status === "Active" &&
      account.accountType === "Credit Card"
  );

  const comparableCreditLimits =
    !filters.branch &&
    !filters.entityCode &&
    filters.to === jamaicaDate(new Date()) &&
    activeCards.every(
      (account) =>
        (account.currency || "JMD") === "JMD"
    );

  const creditLimit = comparableCreditLimits
    ? sumMoney(
        activeCards,
        (account) => Number(account.creditLimit || 0)
      )
    : null;

  const treasury = {
    cashAndBank: closingCash,
    creditCardOutstanding,
    netTreasuryPosition: roundMoney(
      closingCash - creditCardOutstanding
    ),
    creditLimit,
    availableCredit:
      creditLimit > 0
        ? roundMoney(
            creditLimit - creditCardOutstanding
          )
        : null,
    creditUtilization:
      creditLimit > 0
        ? roundMoney(
            (creditCardOutstanding / creditLimit) * 100
          )
        : null,
  };

  warn(
    "SOURCE_COMPLETENESS",
    "Reports reflect recorded ledger activity. Completeness against bank statements and business source records has not yet been verified."
  );

  const diagnostics = {
    accountCount: rows.length,
    ledgerLineCount: scopedLedger.length,
    outOfBalance: trialDifference !== 0,
    issues,
  };

  return {
    filters,
    trialBalance: {
      filters,
      rows,
      totals: {
        totalDebits,
        totalCredits,
        difference: trialDifference,
        isBalanced: trialDifference === 0,
      },
      diagnostics,
    },
    profitAndLoss,
    balanceSheet,
    cashFlow,
    monthlyTrend,
    treasury,
    diagnostics,

    // Internal context for the reporting service.
    // These fields must not be returned directly through an API.
    _journalMap: journalMap,
    _rawLedger: rawLedger,
  };
};

module.exports = {
  buildReportBundle,
  resolveFilters,
  dateOnly,
  canonicalBranch,
  jamaicaDate,
};