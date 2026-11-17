const {
  buildReportBundle,
} = require("../services/accountingEngine/reportingService");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

// Quote every cell and protect text from spreadsheet formula execution.
// Numeric amounts remain numeric, including negative amounts.
const csvCell = (value) => {
  let text = String(value ?? "");

  if (
    typeof value !== "number" &&
    /^[\s\u0000-\u001f]*[=+\-@]/.test(text)
  ) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
};

const buildCSV = (rows) =>
  "\uFEFF" +
  rows
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

const readOptions = (query) => {
  const options = {};

  for (const key of ["entityCode", "from", "to", "branch"]) {
    const value = query[key];

    if (value !== undefined && typeof value !== "string") {
      const error = new Error(`Invalid ${key} filter.`);
      error.statusCode = 400;
      throw error;
    }

    options[key] = String(value || "").trim();
  }

  if (!options.entityCode) {
    const error = new Error("Enter the business entity code.");
    error.statusCode = 400;
    throw error;
  }

  options.entityCode = options.entityCode.toUpperCase();

  if (!/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(options.entityCode)) {
    const error = new Error("Enter a valid business entity code.");
    error.statusCode = 400;
    throw error;
  }

  return options;
};

const metadataRows = (title, bundle, cumulative) => {
  const { filters, diagnostics } = bundle;

  return [
    ["Report", title],
    ["Business entity", filters.entityCode],
    ["Currency", filters.currency],
    ["Time zone", filters.timeZone],
    ["Branch", filters.branch || "All Branches"],
    [
      "Date basis",
      cumulative
        ? "Cumulative ledger balances through ending date"
        : "Recorded ledger movements within selected dates",
    ],
    [
      "Starting date",
      cumulative
        ? "All recorded dates through ending date"
        : filters.from || "Beginning of recorded ledger",
    ],
    ["Ending date", filters.to],
    ["Generated at UTC", new Date().toISOString()],
    ["Scoped ledger lines through ending date", diagnostics.ledgerLineCount],
    [
      "Record completeness",
      "Recorded ledger only. Missing business activity is not treated as savings or proof of profitability.",
    ],
    [
      "Review notice scope",
      "Some service warnings identify excluded or unattributed records outside the selected business or branch.",
    ],
    [],
    ["Review code", "Review finding", "Count"],
    ...diagnostics.issues.map((issue) => [
      issue.code,
      issue.message,
      issue.count,
    ]),
    [],
  ];
};

const trialBalanceRows = (bundle) => {
  const report = bundle.trialBalance;

  return [
    ...metadataRows("Trial Balance", bundle, true),
    [
      "Account Code",
      "Account Name",
      "Category",
      "Type",
      "Normal Balance",
      "Debit Balance",
      "Credit Balance",
      "Status",
    ],
    ...report.rows.map((row) => [
      row.accountCode,
      row.accountName,
      row.accountCategory,
      row.accountType,
      row.normalBalance,
      row.trialDebit,
      row.trialCredit,
      row.status,
    ]),
    [
      "",
      "TOTAL",
      "",
      "",
      "",
      report.totals.totalDebits,
      report.totals.totalCredits,
      "",
    ],
    ["Difference: debit less credit", report.totals.difference],
    ["Balanced", report.totals.isBalanced ? "Yes" : "No"],
  ];
};

const generalLedgerRows = (bundle) => {
  const { filters } = bundle;
  const balances = new Map();

  const ordered = [...bundle._scopedLedger].sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      String(a.entryNumber || "").localeCompare(
        String(b.entryNumber || "")
      ) ||
      String(a.ledgerNumber || "").localeCompare(
        String(b.ledgerNumber || "")
      ) ||
      String(a._id || "").localeCompare(String(b._id || ""))
  );

  const lines = [];
  let totalDebits = 0;
  let totalCredits = 0;

  for (const line of ordered) {
    const balance = roundMoney(
      (balances.get(line.accountCode) || 0) +
        line.debit -
        line.credit
    );

    balances.set(line.accountCode, balance);

    // Earlier activity contributes to running balances but is not exported
    // as selected-period movement.
    if (filters.from && line.day < filters.from) continue;

    totalDebits = roundMoney(totalDebits + line.debit);
    totalCredits = roundMoney(totalCredits + line.credit);

    lines.push([
      line.day,
      line.ledgerNumber || "",
      line.entryNumber || "",
      line.accountCode,
      line.accountName || "",
      line.resolvedCategory,
      line.debit,
      line.credit,
      balance,
      line.reference || "",
      line.memo || line.description || "",
      line.sourceModule || "",
    ]);
  }

  return [
    ...metadataRows("General Ledger", bundle, false),
    [
      "Running balance basis",
      "Per account within selected business and branch, including earlier recorded activity. Positive is net debit; negative is net credit.",
    ],
    ["Selected-period ledger lines", lines.length],
    [
      "Same-day order",
      "Posting date, journal number, ledger number, then record ID.",
    ],
    [],
    [
      "Date",
      "Ledger Number",
      "Journal Entry",
      "Account Code",
      "Account Name",
      "Category",
      "Debit",
      "Credit",
      "Account Running Net Debit Balance",
      "Reference",
      "Memo",
      "Source Module",
    ],
    ...lines,
    ["", "", "", "", "PERIOD TOTAL", "", totalDebits, totalCredits],
    ["Period debit less credit", roundMoney(totalDebits - totalCredits)],
  ];
};

const profitAndLossRows = (bundle) => {
  const report = bundle.profitAndLoss;

  const section = (name, group) => [
    ...group.accounts.map((account) => [
      name,
      account.accountCode,
      account.accountName,
      account.amount,
    ]),
    [name, "", `Total ${name}`, group.total],
  ];

  return [
    ...metadataRows("Profit & Loss", bundle, false),
    ["Section", "Account Code", "Account Name", "Amount"],
    ...section("Revenue", report.revenue),
    ...section("Cost of Sales", report.costOfSales),
    ["", "", "Gross Profit", report.grossProfit],
    ...section("Operating Expenses", report.operatingExpenses),
    ["", "", "Net Profit/Loss", report.netProfit],
    [],
    [
      "Trial balance difference",
      report.diagnostics.trialBalanceDifference,
    ],
    [
      "Trial balance balanced",
      report.diagnostics.trialBalanceIsBalanced ? "Yes" : "No",
    ],
  ];
};

const balanceSheetRows = (bundle) => {
  const report = bundle.balanceSheet;

  const section = (name, group) => [
    ...group.accounts.map((account) => [
      name,
      account.accountCode,
      account.accountName,
      account.amount,
    ]),
    [name, "", `Total ${name}`, group.total],
  ];

  return [
    ...metadataRows("Balance Sheet", bundle, true),
    ["Section", "Account Code", "Account Name", "Balance"],
    ...section("Assets", report.assets),
    ...section("Liabilities", report.liabilities),
    ...section("Equity", report.equity),
    [
      "",
      "",
      "Total Liabilities and Equity",
      report.totals.liabilitiesPlusEquity,
    ],
    ["", "", "Balance Sheet Difference", report.totals.difference],
    ["Balanced", report.totals.isBalanced ? "Yes" : "No"],
    [],
    [
      "Equity presentation",
      "Unclosed earnings are included in equity as calculated by the reporting service. Exporting creates no closing journal.",
    ],
  ];
};

const makeExport = (name, buildRows) => async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  try {
    const options = readOptions(req.query);
    const bundle = await buildReportBundle(options);
    const { filters } = bundle;

    const filename = [
      name,
      filters.entityCode,
      filters.from || "all",
      "to",
      filters.to,
    ].join("-");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}.csv"`
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");

    return res.send(buildCSV(buildRows(bundle)));
  } catch (error) {
    console.error(`${name} export error:`, error);

    const status = error.statusCode === 400 ? 400 : 500;

    return res.status(status).json({
      success: false,
      message:
        status === 400
          ? error.message
          : "Could not generate the financial export. Please try again.",
    });
  }
};

module.exports = {
  exportTrialBalance: makeExport("trial-balance", trialBalanceRows),
  exportGeneralLedger: makeExport("general-ledger", generalLedgerRows),
  exportProfitAndLoss: makeExport("profit-loss", profitAndLossRows),
  exportBalanceSheet: makeExport("balance-sheet", balanceSheetRows),
};