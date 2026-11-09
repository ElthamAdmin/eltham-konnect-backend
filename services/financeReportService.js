const Payroll = require("../models/Payroll");
const Invoice = require("../models/Invoice");

const {
  buildReportBundle,
  dateOnly,
  canonicalBranch,
} = require("./accountingEngine/reportingService");

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const DEDUCTION_FIELDS = [
  "nisEmployee",
  "nhtEmployee",
  "educationTax",
  "incomeTax",
  "pensionEmployee",
];

const validAmount = (value) => {
  const amount = Number(value ?? 0);

  return (
    Number.isFinite(amount) &&
    amount >= 0 &&
    Number.isSafeInteger(Math.round(amount * 100))
  );
};

const lineSignature = (lines) => {
  if (!Array.isArray(lines) || lines.length < 2) {
    return null;
  }

  const invalidLine = lines.some(
    (line) =>
      !line.accountCode ||
      !validAmount(line.debit) ||
      !validAmount(line.credit) ||
      (Number(line.debit || 0) > 0 &&
        Number(line.credit || 0) > 0)
  );

  if (invalidLine) return null;

  const debit = roundMoney(
    lines.reduce(
      (sum, line) => sum + Number(line.debit || 0),
      0
    )
  );

  const credit = roundMoney(
    lines.reduce(
      (sum, line) => sum + Number(line.credit || 0),
      0
    )
  );

  if (debit !== credit || debit <= 0) {
    return null;
  }

  return JSON.stringify(
    lines
      .map((line) => [
        String(line.accountCode),
        roundMoney(line.debit || 0),
        roundMoney(line.credit || 0),
      ])
      .sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b))
      )
  );
};

const buildFinanceReport = async (options = {}) => {
  const bundle = await buildReportBundle(options);

  const {
    filters,
    _journalMap: journalMap,
    _rawLedger: ledger,
  } = bundle;

  const [payroll, invoices] = await Promise.all([
    Payroll.find({ status: "Paid" }).lean(),
    Invoice.find().lean(),
  ]);

  const withinPeriod = (day) =>
    Boolean(
      day &&
        day <= filters.to &&
        (!filters.from || day >= filters.from)
    );

  const belongsToScope = (journal) =>
    (!filters.branch ||
      canonicalBranch(journal?.branch) === filters.branch) &&
    (!filters.entityCode ||
      journal?.entityCode === filters.entityCode);

  const exceptions = [];

  const addException = (
    record,
    issue,
    scope = "Selected period"
  ) => {
    exceptions.push({ record, issue, scope });
  };

  const statutoryTotals = Object.fromEntries(
    [...DEDUCTION_FIELDS, "totalDeductions"].map(
      (field) => [field, 0]
    )
  );

  const employees = new Map();
  const ledgerByJournal = new Map();
  const payrollLinkCounts = new Map();

  for (const line of ledger) {
    if (!ledgerByJournal.has(line.entryNumber)) {
      ledgerByJournal.set(line.entryNumber, []);
    }

    ledgerByJournal.get(line.entryNumber).push(line);
  }

  for (const record of payroll) {
    if (record.journalEntryNumber) {
      payrollLinkCounts.set(
        record.journalEntryNumber,
        (payrollLinkCounts.get(record.journalEntryNumber) ||
          0) + 1
      );
    }
  }

  let verifiedPaidGross = 0;
  let includedPayrollCount = 0;

  /*
   * Payroll documents provide employee deduction details.
   * Financial expense totals continue to come from the ledger.
   */

  for (const record of payroll) {
    const number = record.payrollNumber;

    const journal = journalMap.get(
      record.journalEntryNumber
    );

    const postingDate = dateOnly(journal?.entryDate);

    // Missing links cannot safely be assigned to a period.
    if (!journal || !postingDate) {
      addException(
        number,
        "Paid payroll has no matching journal with a valid posting date. Deduction detail excluded.",
        "Unscoped: journal link or posting date unavailable"
      );

      continue;
    }

    if (
      !withinPeriod(postingDate) ||
      !belongsToScope(journal)
    ) {
      continue;
    }

    const invalidJournal =
      journal.status !== "Posted" ||
      journal.isReversal ||
      journal.reversedAt ||
      journal.reversalEntryNumber ||
      journal.reference !== number ||
      journal.sourceModule !== "Payroll";

    if (invalidJournal) {
      addException(
        number,
        "Paid payroll has no valid unreversed posted Payroll journal. Deduction detail excluded."
      );

      continue;
    }

    if (
      payrollLinkCounts.get(record.journalEntryNumber) !== 1
    ) {
      addException(
        number,
        "Multiple Paid payroll records reference this journal. Deduction detail excluded pending review."
      );

      continue;
    }

    const ledgerLines =
      ledgerByJournal.get(journal.entryNumber) || [];

    const journalSignature = lineSignature(journal.lines);

    const ledgerDisagrees =
      !journalSignature ||
      journalSignature !== lineSignature(ledgerLines) ||
      ledgerLines.some(
        (line) => dateOnly(line.entryDate) !== postingDate
      );

    if (ledgerDisagrees) {
      addException(
        number,
        "Payroll journal and ledger lines or posting dates disagree. Deduction detail excluded."
      );

      continue;
    }

    const invalidPayrollAmount = [
      ...DEDUCTION_FIELDS,
      "grossPay",
      "netPay",
    ].some((field) => !validAmount(record[field]));

    if (invalidPayrollAmount) {
      addException(
        number,
        "Payroll contains invalid amounts. Deduction detail excluded."
      );

      continue;
    }

    const actualPaymentDate = dateOnly(
      record.historicalPayment?.isHistorical
        ? record.historicalPayment.actualPaymentDate
        : record.payDate
    );

    if (
      !actualPaymentDate ||
      actualPaymentDate !== postingDate
    ) {
      addException(
        number,
        `Recorded payment date ${
          actualPaymentDate || "missing"
        } differs from posting date ${postingDate}. Reporting uses the posting date.`
      );
    }

    const employeeKey = String(
      record.employeeId || `UNIDENTIFIED:${number}`
    );

    if (!record.employeeId) {
      addException(
        number,
        "Employee ID is missing. This payroll is displayed separately rather than merged by employee name."
      );
    }

    if (!employees.has(employeeKey)) {
      employees.set(employeeKey, {
        employeeId: record.employeeId || "",
        employeeName: record.employeeName || "Not recorded",
        role: record.role || "",
        grossPay: 0,
        netPay: 0,
        totalDeductions: 0,
        ...Object.fromEntries(
          DEDUCTION_FIELDS.map((field) => [field, 0])
        ),
        postingDates: [],
        actualPaymentDates: [],
      });
    }

    const employee = employees.get(employeeKey);
    let deductions = 0;

    for (const field of DEDUCTION_FIELDS) {
      const amount = Number(record[field] ?? 0);

      statutoryTotals[field] = roundMoney(
        statutoryTotals[field] + amount
      );

      employee[field] = roundMoney(
        employee[field] + amount
      );

      deductions += amount;
    }

    deductions = roundMoney(deductions);

    statutoryTotals.totalDeductions = roundMoney(
      statutoryTotals.totalDeductions + deductions
    );

    employee.totalDeductions = roundMoney(
      employee.totalDeductions + deductions
    );

    employee.grossPay = roundMoney(
      employee.grossPay + Number(record.grossPay ?? 0)
    );

    employee.netPay = roundMoney(
      employee.netPay + Number(record.netPay ?? 0)
    );

    employee.postingDates.push(postingDate);

    employee.actualPaymentDates.push(
      actualPaymentDate || "Not recorded"
    );

    verifiedPaidGross = roundMoney(
      verifiedPaidGross + Number(record.grossPay ?? 0)
    );

    includedPayrollCount += 1;
  }

  for (const employee of employees.values()) {
    employee.postingDates = [
      ...new Set(employee.postingDates),
    ].sort();

    employee.actualPaymentDates = [
      ...new Set(employee.actualPaymentDates),
    ].sort();
  }

  /*
   * Invoice counts describe current statuses of invoices
   * issued in the period. They are not historical receipt counts.
   */

  const invoiceStats = {
    paidCount: 0,
    unpaidCount: 0,
    basis:
      "Current statuses of invoices issued within the selected period; not historical payment counts.",
  };

  for (const invoice of invoices) {
    if (
      ["Draft", "Cancelled", "Refunded"].includes(
        invoice.status
      )
    ) {
      continue;
    }

    const journal = journalMap.get(
      invoice.journalEntryNumber
    );

    const issuedDate =
      dateOnly(invoice.createdAt) ||
      dateOnly(journal?.entryDate);

    if (
      !withinPeriod(issuedDate) ||
      !belongsToScope(journal)
    ) {
      continue;
    }

    if (invoice.status === "Paid") {
      invoiceStats.paidCount += 1;
    } else if (
      ["Unpaid", "Partially Paid"].includes(invoice.status)
    ) {
      invoiceStats.unpaidCount += 1;
    }
  }

  const profitLoss = bundle.profitAndLoss;

  const payrollExpense = roundMoney(
    profitLoss.operatingExpenses.accounts
      .filter((account) => account.accountCode === "6100")
      .reduce((sum, account) => sum + account.amount, 0)
  );

  // Payroll is already included in operating expenses.
  const totalExpenses = roundMoney(
    profitLoss.costOfSales.total +
      profitLoss.operatingExpenses.total
  );

  if (payrollExpense !== verifiedPaidGross) {
    addException(
      "Payroll reconciliation",
      `Ledger payroll expense ${payrollExpense.toFixed(
        2
      )} differs from verified Paid payroll gross ${verifiedPaidGross.toFixed(
        2
      )}. No records were changed.`
    );
  }

  const issues = [...bundle.diagnostics.issues];

  if (exceptions.length) {
    issues.push({
      code: "PAYROLL_EXCEPTIONS",
      count: exceptions.length,
      message:
        "Payroll exceptions exist. Unscoped records are identified separately; financial totals remain ledger-based.",
    });
  }

  if (filters.branch) {
    issues.push({
      code: "BRANCH_SCOPE",
      count: 1,
      message:
        "Only identifiable recorded branch assignments are included. Unassigned historical activity is not allocated automatically.",
    });
  }

  return {
    filters,

    reportMeta: {
      generatedAt: new Date().toISOString(),
      reportTitle: "EKOS Ledger Reports",
      sourceOfTruth: "Recorded General Ledger, JMD",
      periodBasis:
        "Profit and cash movements use the selected period; Balance Sheet and Trial Balance are as of the ending date.",
      businessScope:
        filters.entityCode ||
        "All businesses, including unattributed historical records",
      reconciliationStatus:
        "Source-record completeness not yet verified",
      payrollBasis:
        "Current Paid payroll with a valid unreversed posted Payroll journal; filtered by posting date. This is not a historical payroll-status reconstruction.",
      deductionBasis:
        "Employee NIS, NHT, Education Tax, Income Tax and Pension. Advance recoveries and employer contributions are not included in this deduction total.",
      issues,
      payrollExceptions: exceptions.slice(0, 100),
      payrollExceptionCount: exceptions.length,
      payrollExceptionsTruncated: exceptions.length > 100,
      includedPayrollCount,
      verifiedPaidGross,
    },

    trialBalance: bundle.trialBalance,
    balanceSheet: bundle.balanceSheet,
    cashFlow: bundle.cashFlow,

    profitAndLossLegacy: profitLoss,

    profitAndLoss: {
      revenue: profitLoss.revenue.total,
      costOfSales: profitLoss.costOfSales.total,
      grossProfit: profitLoss.grossProfit,
      operatingExpenses: profitLoss.operatingExpenses.total,
      payrollExpense,
      totalExpenses,
      netProfit: profitLoss.netProfit,
    },

    expenseByCategory: [
      ...profitLoss.costOfSales.accounts,
      ...profitLoss.operatingExpenses.accounts,
    ].map((account) => ({
      category: account.accountName,
      amount: account.amount,
    })),

    statutoryTotals,
    statutoryByEmployee: [...employees.values()],
    invoiceStats,
    monthlyTrend: bundle.monthlyTrend,
    treasury: bundle.treasury,

    diagnostics: {
      ...bundle.diagnostics,
      issues,
    },

    kpis: {
      totalRevenue: profitLoss.revenue.total,
      totalExpenses,
      netProfit: profitLoss.netProfit,
      outstandingReceivables:
        bundle.balanceSheet.assets.accountsReceivable,
      cashBalance: bundle.treasury.cashAndBank,
      paidInvoiceCount: invoiceStats.paidCount,
      unpaidInvoiceCount: invoiceStats.unpaidCount,
    },

    health: {
      trialBalanceBalanced:
        bundle.trialBalance.totals.isBalanced,
      balanceSheetBalanced:
        bundle.balanceSheet.totals.isBalanced,
      trialBalanceDifference:
        bundle.trialBalance.totals.difference,
      balanceSheetDifference:
        bundle.balanceSheet.totals.difference,
      accountingStatus: "Reconciliation required",
    },

    sections: {
      profitLoss,
      balanceSheet: bundle.balanceSheet,
      cashFlow: bundle.cashFlow,
      trialBalance: bundle.trialBalance,
    },
  };
};

module.exports = {
  buildFinanceReport,
};