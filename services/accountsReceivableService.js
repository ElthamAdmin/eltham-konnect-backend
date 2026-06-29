const Invoice = require("../models/Invoice");
const Customer = require("../models/Customer");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

const AR_ACCOUNT_CODE = "1100";

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getAgeBucket = (invoice) => {
  const dateValue = invoice.dueDate || invoice.createdAt;
  const dueDate = new Date(dateValue);
  if (Number.isNaN(dueDate.getTime())) return "Unknown";

  const today = new Date();
  const diffDays = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Current";
  if (diffDays <= 30) return "1-30";
  if (diffDays <= 60) return "31-60";
  if (diffDays <= 90) return "61-90";
  return "90+";
};

const getOpenInvoices = async () => {
  return Invoice.find({
    status: { $in: ["Unpaid", "Partially Paid"] },
  }).sort({ createdAt: 1 });
};

const getInvoiceExpectedBalance = (invoice) =>
  roundMoney(Number(invoice.finalTotal || 0) - Number(invoice.amountPaid || 0));

const getInvoiceReportBalance = (invoice) => {
  const storedBalance = roundMoney(invoice.balanceDue);
  if (storedBalance > 0) return storedBalance;
  return getInvoiceExpectedBalance(invoice);
};

const buildAgingReport = async () => {
  const invoices = await getOpenInvoices();

  const buckets = {
    Current: 0,
    "1-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
    Unknown: 0,
  };

  const rows = invoices.map((invoice) => {
    const balanceDue = getInvoiceReportBalance(invoice);
    const bucket = getAgeBucket(invoice);

    buckets[bucket] = roundMoney(Number(buckets[bucket] || 0) + balanceDue);

    return {
      invoiceNumber: invoice.invoiceNumber,
      customerEkonId: invoice.customerEkonId,
      customerName: invoice.customerName,
      invoiceDate: invoice.createdAt,
      dueDate: invoice.dueDate || invoice.createdAt,
      finalTotal: roundMoney(invoice.finalTotal),
      amountPaid: roundMoney(invoice.amountPaid),
      balanceDue,
      status: invoice.status,
      bucket,
    };
  });

  const totalOutstanding = roundMoney(
    rows.reduce((sum, row) => sum + Number(row.balanceDue || 0), 0)
  );

  return {
    generatedAt: new Date().toISOString(),
    buckets,
    totalOutstanding,
    rows,
  };
};

const buildCustomerStatement = async (customerEkonId) => {
  const customer = await Customer.findOne({ ekonId: customerEkonId });

  if (!customer) throw new Error("Customer not found.");

  const invoices = await Invoice.find({ customerEkonId }).sort({
    createdAt: 1,
    invoiceNumber: 1,
  });

  const rows = invoices.map((invoice) => ({
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.createdAt,
    dueDate: invoice.dueDate || invoice.createdAt,
    status: invoice.status,
    finalTotal: roundMoney(invoice.finalTotal),
    amountPaid: roundMoney(invoice.amountPaid),
    balanceDue: getInvoiceReportBalance(invoice),
    paymentHistory: invoice.paymentHistory || [],
  }));

  const totalInvoiced = roundMoney(
    rows.reduce((sum, row) => sum + Number(row.finalTotal || 0), 0)
  );

  const totalPaid = roundMoney(
    rows.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0)
  );

  const totalOutstanding = roundMoney(
    rows
      .filter((row) => ["Unpaid", "Partially Paid"].includes(row.status))
      .reduce((sum, row) => sum + Number(row.balanceDue || 0), 0)
  );

  return {
    customer: {
      ekonId: customer.ekonId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      branch: customer.branch,
    },
    totals: {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
    },
    rows,
  };
};

const reconcileARSubledgerToGL = async () => {
  const invoices = await getOpenInvoices();

  const subledgerBalance = roundMoney(
    invoices.reduce((sum, invoice) => sum + getInvoiceReportBalance(invoice), 0)
  );

  const glLines = await GeneralLedgerTransaction.find({
    accountCode: AR_ACCOUNT_CODE,
  });

  const glBalance = roundMoney(
    glLines.reduce(
      (sum, line) => sum + Number(line.debit || 0) - Number(line.credit || 0),
      0
    )
  );

  return {
    subledgerBalance,
    glBalance,
    difference: roundMoney(subledgerBalance - glBalance),
    isReconciled: roundMoney(subledgerBalance - glBalance) === 0,
  };
};

const findInvoiceNumberInLedgerLine = (line, invoiceNumbers = []) => {
  const searchableText = [
    line.reference,
    line.memo,
    line.description,
    line.entryNumber,
  ]
    .filter(Boolean)
    .join(" ");

  return invoiceNumbers.find((invoiceNumber) =>
    searchableText.includes(invoiceNumber)
  );
};

const getHighestSeverity = (issueTypes = []) => {
  if (
    issueTypes.some((type) =>
      [
        "OPEN_INVOICE_WITH_NO_AR_LEDGER",
        "ORPHAN_AR_LEDGER_LINE",
        "DUPLICATE_AR_POSTING",
      ].includes(type)
    )
  ) {
    return "Critical";
  }

  if (
    issueTypes.some((type) =>
      [
        "INVOICE_LEDGER_MISMATCH",
        "INVOICE_BALANCE_FIELD_MISMATCH",
        "PAID_INVOICE_WITH_BALANCE",
      ].includes(type)
    )
  ) {
    return "Warning";
  }

  return "Information";
};

const getHealthScore = ({ criticalCount, warningCount, difference }) => {
  let score = 100;

  score -= criticalCount * 5;
  score -= warningCount * 0.25;

  if (Math.abs(Number(difference || 0)) > 0) {
    score -= Math.min(5, Math.abs(Number(difference || 0)) / 100);
  }

  score = Math.max(0, roundMoney(score));

  let status = "Perfect";
  if (score < 100 && score >= 98) status = "Excellent";
  if (score < 98 && score >= 95) status = "Good";
  if (score < 95 && score >= 90) status = "Fair";
  if (score < 90) status = "Needs Attention";

  return { score, status };
};

const buildReconciliationRecommendation = ({ difference, issueSummary }) => {
  if (difference === 0 && Number(issueSummary.critical || 0) === 0) {
    return "Accounts Receivable subledger reconciles with the General Ledger.";
  }

  if (Number(issueSummary.critical || 0) > 0) {
    return "Review critical AR posting issues before proceeding to collections or write-offs.";
  }

  if (Math.abs(Number(difference || 0)) <= 500) {
    return "AR is nearly balanced. Review small legacy or migration differences.";
  }

  return "Investigate AR subledger and General Ledger difference.";
};

const buildARDiagnosticAudit = async () => {
  const invoices = await Invoice.find().sort({
    createdAt: 1,
    invoiceNumber: 1,
  });

  const arLedgerLines = await GeneralLedgerTransaction.find({
    accountCode: AR_ACCOUNT_CODE,
  }).sort({
    entryDate: 1,
    createdAt: 1,
  });

  const invoiceNumbers = invoices.map((invoice) => invoice.invoiceNumber);
  const invoiceMap = {};

  invoices.forEach((invoice) => {
    const expectedBalance = getInvoiceExpectedBalance(invoice);
    const reportBalance = getInvoiceReportBalance(invoice);

    invoiceMap[invoice.invoiceNumber] = {
      invoiceNumber: invoice.invoiceNumber,
      customerEkonId: invoice.customerEkonId,
      customerName: invoice.customerName,
      status: invoice.status,
      finalTotal: roundMoney(invoice.finalTotal),
      amountPaid: roundMoney(invoice.amountPaid),
      storedBalanceDue: roundMoney(invoice.balanceDue),
      expectedBalanceDue: expectedBalance,
      reportBalanceDue: reportBalance,
      invoiceBalanceMismatch: roundMoney(
        Number(invoice.balanceDue || 0) - expectedBalance
      ),
      ledgerDebit: 0,
      ledgerCredit: 0,
      relatedLedgerLines: [],
    };
  });

  const orphanLedgerLines = [];

  arLedgerLines.forEach((line) => {
    const invoiceNumber = findInvoiceNumberInLedgerLine(line, invoiceNumbers);

    const lineData = {
      ledgerNumber: line.ledgerNumber,
      entryNumber: line.entryNumber,
      entryDate: line.entryDate,
      debit: roundMoney(line.debit),
      credit: roundMoney(line.credit),
      reference: line.reference,
      sourceModule: line.sourceModule,
      memo: line.memo,
      description: line.description,
      issueTypes: ["ORPHAN_AR_LEDGER_LINE"],
      severity: "Critical",
    };

    if (!invoiceNumber) {
      orphanLedgerLines.push(lineData);
      return;
    }

    invoiceMap[invoiceNumber].ledgerDebit = roundMoney(
      invoiceMap[invoiceNumber].ledgerDebit + Number(line.debit || 0)
    );

    invoiceMap[invoiceNumber].ledgerCredit = roundMoney(
      invoiceMap[invoiceNumber].ledgerCredit + Number(line.credit || 0)
    );

    invoiceMap[invoiceNumber].relatedLedgerLines.push(lineData);
  });

  const rows = Object.values(invoiceMap).map((row) => {
    const ledgerBalance = roundMoney(row.ledgerDebit - row.ledgerCredit);
    const ledgerDifference = roundMoney(ledgerBalance - row.reportBalanceDue);
    const issueTypes = [];

    if (
      ["Unpaid", "Partially Paid"].includes(row.status) &&
      row.relatedLedgerLines.length === 0
    ) {
      issueTypes.push("OPEN_INVOICE_WITH_NO_AR_LEDGER");
    }

    if (row.status === "Paid" && row.reportBalanceDue !== 0) {
      issueTypes.push("PAID_INVOICE_WITH_BALANCE");
    }

    if (
      ["Unpaid", "Partially Paid"].includes(row.status) &&
      row.invoiceBalanceMismatch !== 0
    ) {
      issueTypes.push("INVOICE_BALANCE_FIELD_MISMATCH");
    }

    if (
      row.relatedLedgerLines.length > 0 &&
      ledgerDifference !== 0 &&
      Math.abs(ledgerDifference) >= 0.01
    ) {
      issueTypes.push("INVOICE_LEDGER_MISMATCH");
    }

    const severity = issueTypes.length > 0 ? getHighestSeverity(issueTypes) : "";

    return {
      ...row,
      ledgerBalance,
      ledgerDifference,
      issueTypes,
      severity,
      hasIssue: issueTypes.length > 0,
    };
  });

  const issues = rows.filter((row) => row.hasIssue);

  const severitySummary = {
    critical: issues.filter((issue) => issue.severity === "Critical").length +
      orphanLedgerLines.length,
    warning: issues.filter((issue) => issue.severity === "Warning").length,
    information: issues.filter((issue) => issue.severity === "Information").length,
  };

  severitySummary.total =
    severitySummary.critical + severitySummary.warning + severitySummary.information;

  const issueTypes = [...issues, ...orphanLedgerLines].reduce((summary, row) => {
    (row.issueTypes || []).forEach((type) => {
      summary[type] = Number(summary[type] || 0) + 1;
    });
    return summary;
  }, {});

  const invoiceSubledgerBalance = roundMoney(
    rows
      .filter((row) => ["Unpaid", "Partially Paid"].includes(row.status))
      .reduce((sum, row) => sum + Number(row.reportBalanceDue || 0), 0)
  );

  const glARBalance = roundMoney(
    arLedgerLines.reduce(
      (sum, line) => sum + Number(line.debit || 0) - Number(line.credit || 0),
      0
    )
  );

  const difference = roundMoney(invoiceSubledgerBalance - glARBalance);

  const healthScore = getHealthScore({
    criticalCount: severitySummary.critical,
    warningCount: severitySummary.warning,
    difference,
  });

  const autoFixCandidates = {
    balanceDueMismatch: Number(issueTypes.INVOICE_BALANCE_FIELD_MISMATCH || 0),
    paidInvoiceWithBalance: Number(issueTypes.PAID_INVOICE_WITH_BALANCE || 0),
    openInvoiceMissingARLedger: Number(issueTypes.OPEN_INVOICE_WITH_NO_AR_LEDGER || 0),
  };

  const recommendations = [];

  if (autoFixCandidates.balanceDueMismatch > 0) {
    recommendations.push(
      `Recalculate balanceDue for ${autoFixCandidates.balanceDueMismatch} invoice(s).`
    );
  }

  if (autoFixCandidates.paidInvoiceWithBalance > 0) {
    recommendations.push(
      `Review ${autoFixCandidates.paidInvoiceWithBalance} paid invoice(s) with remaining balance.`
    );
  }

  if (autoFixCandidates.openInvoiceMissingARLedger > 0) {
    recommendations.push(
      `Create missing AR journal entry for ${autoFixCandidates.openInvoiceMissingARLedger} open invoice(s).`
    );
  }

  if (orphanLedgerLines.length > 0) {
    recommendations.push(
      `Review ${orphanLedgerLines.length} orphan AR ledger line(s), likely migration or legacy entries.`
    );
  }

  return {
    generatedAt: new Date().toISOString(),

    totals: {
      invoiceSubledgerBalance,
      glARBalance,
      difference,
      isReconciled: difference === 0,
      invoiceCount: rows.length,
      issueCount: severitySummary.total,
      orphanLedgerLineCount: orphanLedgerLines.length,
    },

    reconciliation: {
      status:
        difference === 0
          ? "Balanced"
          : Math.abs(difference) <= 500
            ? "Nearly Balanced"
            : "Out of Balance",
      difference,
      recommendation: buildReconciliationRecommendation({
        difference,
        issueSummary: severitySummary,
      }),
    },

    healthScore,
    issueSummary: severitySummary,
    issueTypes,
    autoFixCandidates,
    recommendations,

    issues,
    orphanLedgerLines,
    rows,
  };
};

module.exports = {
  buildAgingReport,
  buildCustomerStatement,
  reconcileARSubledgerToGL,
  buildARDiagnosticAudit,
};