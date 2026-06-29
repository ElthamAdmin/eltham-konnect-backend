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

const buildCollectionsDashboard = async () => {
  const aging = await buildAgingReport();
  const reconciliation = await reconcileARSubledgerToGL();
  const diagnostic = await buildARDiagnosticAudit();

  const rows = aging.rows || [];

  const overdueRows = rows.filter((row) =>
    ["31-60", "61-90", "90+"].includes(row.bucket)
  );

  const topDebtors = [...rows]
    .sort((a, b) => Number(b.balanceDue || 0) - Number(a.balanceDue || 0))
    .slice(0, 10);

  const oldestInvoices = [...rows]
    .sort((a, b) => new Date(a.invoiceDate) - new Date(b.invoiceDate))
    .slice(0, 10);

  const customersMap = {};

  rows.forEach((row) => {
    if (!customersMap[row.customerEkonId]) {
      customersMap[row.customerEkonId] = {
        customerEkonId: row.customerEkonId,
        customerName: row.customerName,
        outstandingBalance: 0,
        invoiceCount: 0,
        oldestInvoiceDate: row.invoiceDate,
      };
    }

    customersMap[row.customerEkonId].outstandingBalance = roundMoney(
      customersMap[row.customerEkonId].outstandingBalance + Number(row.balanceDue || 0)
    );

    customersMap[row.customerEkonId].invoiceCount += 1;

    if (new Date(row.invoiceDate) < new Date(customersMap[row.customerEkonId].oldestInvoiceDate)) {
      customersMap[row.customerEkonId].oldestInvoiceDate = row.invoiceDate;
    }
  });

  const overdueCustomers = Object.values(customersMap).filter((customer) =>
    overdueRows.some((row) => row.customerEkonId === customer.customerEkonId)
  );

  const currentAmount = roundMoney(
    Number(aging.buckets.Current || 0) + Number(aging.buckets["1-30"] || 0)
  );

  const overdueAmount = roundMoney(
    Number(aging.buckets["31-60"] || 0) +
      Number(aging.buckets["61-90"] || 0) +
      Number(aging.buckets["90+"] || 0)
  );

  const totalOutstanding = roundMoney(aging.totalOutstanding);

  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      totalOutstanding,
      currentAmount,
      overdueAmount,
      overdueCustomers: overdueCustomers.length,
      openInvoiceCount: rows.length,
      reconciliationDifference: reconciliation.difference,
      reconciliationStatus: reconciliation.isReconciled ? "Balanced" : "Review Required",
      diagnosticHealthScore: diagnostic.healthScore,
      criticalIssues: diagnostic.issueSummary?.critical || 0,
      warningIssues: diagnostic.issueSummary?.warning || 0,
    },
    agingBuckets: aging.buckets,
    topDebtors,
    oldestInvoices,
    overdueCustomers,
    recommendations: diagnostic.recommendations || [],
  };
};

const getDaysOutstanding = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;

  return Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  );
};

const getCustomerRiskLevel = ({ oldestInvoiceDays = 0, outstandingBalance = 0 }) => {
  if (oldestInvoiceDays >= 90 || outstandingBalance >= 50000) return "Critical";
  if (oldestInvoiceDays >= 60 || outstandingBalance >= 25000) return "High";
  if (oldestInvoiceDays >= 31 || outstandingBalance >= 10000) return "Medium";
  return "Low";
};

const getCollectionStatusFromRisk = (riskLevel) => {
  if (riskLevel === "Critical") return "Collections";
  if (riskLevel === "High") return "Overdue";
  if (riskLevel === "Medium") return "Follow Up";
  return "Normal";
};

const buildCustomerCollectionRecommendations = ({
  riskLevel,
  openInvoices,
  oldestInvoiceDays,
  outstandingBalance,
  promiseToPayStatus,
}) => {
  const recommendations = [];

  if (openInvoices === 0) {
    recommendations.push("No open receivables. No collection action required.");
    return recommendations;
  }

  if (riskLevel === "Critical") {
    recommendations.push("Escalate this customer for urgent collection review.");
  }

  if (riskLevel === "High") {
    recommendations.push("Contact customer and request payment arrangement.");
  }

  if (oldestInvoiceDays >= 60) {
    recommendations.push("Invoice is over 60 days outstanding. Phone follow-up recommended.");
  }

  if (oldestInvoiceDays >= 90) {
    recommendations.push("Invoice is over 90 days outstanding. Consider final notice or write-off review.");
  }

  if (outstandingBalance >= 25000) {
    recommendations.push("High credit exposure. Review before allowing further credit.");
  }

  if (promiseToPayStatus === "Pending") {
    recommendations.push("Customer has a pending promise-to-pay. Monitor follow-up date.");
  }

  return recommendations;
};

const buildCustomerCollectionsTimeline = (invoiceRows = []) => {
  const timeline = [];

  invoiceRows.forEach((invoice) => {
    timeline.push({
      type: "Invoice Created",
      title: "Invoice Created",
      description: `Invoice ${invoice.invoiceNumber} was created for JMD ${roundMoney(
        invoice.finalTotal
      ).toLocaleString()}.`,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.invoiceDate,
      createdBy: "System",
      severity: "Info",
    });

    if (invoice.collectionsStatus && invoice.collectionsStatus !== "Normal") {
      timeline.push({
        type: "Collection Status",
        title: `Collection status: ${invoice.collectionsStatus}`,
        description: `Invoice ${invoice.invoiceNumber} is currently marked as ${invoice.collectionsStatus}.`,
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.nextFollowUpDate || invoice.invoiceDate,
        createdBy: invoice.assignedCollector || "System",
        severity:
          invoice.collectionsStatus === "Collections" ||
          invoice.collectionsStatus === "Legal Review" ||
          invoice.collectionsStatus === "Written Off"
            ? "Critical"
            : "Warning",
      });
    }

    if (invoice.assignedCollector) {
      timeline.push({
        type: "Collector Assigned",
        title: "Collector Assigned",
        description: `${invoice.assignedCollector} assigned to invoice ${invoice.invoiceNumber}.`,
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.nextFollowUpDate || invoice.invoiceDate,
        createdBy: "System",
        severity: "Info",
      });
    }

    if (invoice.nextFollowUpDate) {
      timeline.push({
        type: "Follow-up Scheduled",
        title: "Follow-up Scheduled",
        description: `Follow-up scheduled for invoice ${invoice.invoiceNumber}.`,
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.nextFollowUpDate,
        createdBy: invoice.assignedCollector || "System",
        severity: "Warning",
      });
    }

    if (invoice.promiseToPayStatus && invoice.promiseToPayStatus !== "None") {
      timeline.push({
        type: "Promise To Pay",
        title: `Promise To Pay - ${invoice.promiseToPayStatus}`,
        description: `Customer promised to pay JMD ${roundMoney(
          invoice.promiseToPayAmount
        ).toLocaleString()} for invoice ${invoice.invoiceNumber}.`,
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.promiseToPayDate || invoice.invoiceDate,
        createdBy: invoice.assignedCollector || "System",
        severity:
          invoice.promiseToPayStatus === "Broken"
            ? "Critical"
            : invoice.promiseToPayStatus === "Fulfilled"
              ? "Success"
              : "Warning",
      });
    }

    (invoice.collectionNotes || []).forEach((note) => {
      timeline.push({
        type: "Collection Note",
        title: "Collection Note",
        description: note.note,
        invoiceNumber: invoice.invoiceNumber,
        date: note.createdAt,
        createdBy: note.createdBy || "System User",
        severity: "Info",
      });
    });

    (invoice.paymentHistory || []).forEach((payment) => {
      timeline.push({
        type: "Payment Received",
        title: "Payment Received",
        description: `Payment of JMD ${roundMoney(
          payment.amount
        ).toLocaleString()} received by ${payment.receivedBy || "System User"}.`,
        invoiceNumber: invoice.invoiceNumber,
        date: payment.paymentDate,
        createdBy: payment.receivedBy || "System User",
        severity: "Success",
        metadata: {
          paymentMethod: payment.paymentMethod,
          receivingAccountName: payment.receivingAccountName,
          journalEntryNumber: payment.journalEntryNumber,
        },
      });
    });
  });

  return timeline
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
};

const buildCustomerCollectionsProfile = async (customerEkonId) => {
  const customer = await Customer.findOne({ ekonId: customerEkonId });

  if (!customer) {
    throw new Error("Customer not found.");
  }

  const invoices = await Invoice.find({ customerEkonId }).sort({
    createdAt: 1,
    invoiceNumber: 1,
  });

  const invoiceRows = invoices.map((invoice) => {
    const balanceDue = getInvoiceReportBalance(invoice);
    const daysOutstanding = getDaysOutstanding(invoice.dueDate || invoice.createdAt);

    return {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.createdAt,
      dueDate: invoice.dueDate || invoice.createdAt,
      status: invoice.status,
      collectionsStatus: invoice.collectionsStatus,
      finalTotal: roundMoney(invoice.finalTotal),
      amountPaid: roundMoney(invoice.amountPaid),
      balanceDue,
      daysOutstanding,
      agingBucket: getAgeBucket(invoice),
      assignedCollector: invoice.assignedCollector || "",
      nextFollowUpDate: invoice.nextFollowUpDate,
      promiseToPayDate: invoice.promiseToPayDate,
      promiseToPayAmount: roundMoney(invoice.promiseToPayAmount),
      promiseToPayStatus: invoice.promiseToPayStatus || "None",
      collectionNotes: invoice.collectionNotes || [],
      paymentHistory: invoice.paymentHistory || [],
    };
  });

  const openInvoiceRows = invoiceRows.filter((row) =>
    ["Unpaid", "Partially Paid"].includes(row.status)
  );

  const totalInvoiced = roundMoney(
    invoiceRows.reduce((sum, row) => sum + Number(row.finalTotal || 0), 0)
  );

  const totalPaid = roundMoney(
    invoiceRows.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0)
  );

  const outstandingBalance = roundMoney(
    openInvoiceRows.reduce((sum, row) => sum + Number(row.balanceDue || 0), 0)
  );

  const oldestInvoiceDays =
    openInvoiceRows.length > 0
      ? Math.max(...openInvoiceRows.map((row) => Number(row.daysOutstanding || 0)))
      : 0;

  const lastPaymentDates = invoiceRows
    .flatMap((row) => row.paymentHistory || [])
    .map((payment) => new Date(payment.paymentDate))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a);

  const lastPaymentDate =
    lastPaymentDates.length > 0 ? lastPaymentDates[0].toISOString() : null;

  const paymentHistory = invoiceRows
    .flatMap((row) =>
      (row.paymentHistory || []).map((payment) => ({
        invoiceNumber: row.invoiceNumber,
        paymentDate: payment.paymentDate,
        amount: roundMoney(payment.amount),
        paymentMethod: payment.paymentMethod,
        receivingAccountName: payment.receivingAccountName,
        journalEntryNumber: payment.journalEntryNumber,
        receivedBy: payment.receivedBy,
      }))
    )
    .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

  const collectionNotes = invoiceRows
    .flatMap((row) =>
      (row.collectionNotes || []).map((note) => ({
        invoiceNumber: row.invoiceNumber,
        note: note.note,
        createdBy: note.createdBy,
        createdAt: note.createdAt,
      }))
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const pendingPromise = openInvoiceRows.find(
    (row) => row.promiseToPayStatus === "Pending"
  );

  const riskLevel = getCustomerRiskLevel({
    oldestInvoiceDays,
    outstandingBalance,
  });

  const collectionStatus = getCollectionStatusFromRisk(riskLevel);

  return {
    customer: {
      ekonId: customer.ekonId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      branch: customer.branch,
      address: customer.address,
      status: customer.status,
    },

    summary: {
      totalInvoiced,
      totalPaid,
      outstandingBalance,
      openInvoiceCount: openInvoiceRows.length,
      totalInvoiceCount: invoiceRows.length,
      oldestInvoiceDays,
      lastPaymentDate,
      riskLevel,
      collectionStatus,
      pendingPromiseToPay: pendingPromise || null,
    },

    openInvoices: openInvoiceRows,
    allInvoices: invoiceRows,
    paymentHistory,
    collectionNotes,
    collectionTimeline: buildCustomerCollectionsTimeline(invoiceRows),

    recommendations: buildCustomerCollectionRecommendations({
      riskLevel,
      openInvoices: openInvoiceRows.length,
      oldestInvoiceDays,
      outstandingBalance,
      promiseToPayStatus: pendingPromise?.promiseToPayStatus || "None",
    }),
  };
};

const isSameOrBeforeToday = (value) => {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return date <= today;
};

const getCollectionPriorityScore = ({
  daysOutstanding = 0,
  balanceDue = 0,
  collectionsStatus = "Normal",
  promiseToPayStatus = "None",
  nextFollowUpDate = null,
  promiseToPayDate = null,
}) => {
  let score = 0;

  score += Math.min(40, Number(daysOutstanding || 0) * 0.5);
  score += Math.min(25, Number(balanceDue || 0) / 1000);

  if (["Overdue", "Collections", "Legal Review"].includes(collectionsStatus)) {
    score += 15;
  }

  if (promiseToPayStatus === "Broken") score += 20;

  if (
    promiseToPayStatus === "Pending" &&
    promiseToPayDate &&
    isSameOrBeforeToday(promiseToPayDate)
  ) {
    score += 20;
  }

  if (nextFollowUpDate && isSameOrBeforeToday(nextFollowUpDate)) {
    score += 10;
  }

  return Math.min(100, roundMoney(score));
};

const getRecommendedCollectionAction = ({
  daysOutstanding = 0,
  collectionsStatus = "Normal",
  promiseToPayStatus = "None",
  nextFollowUpDate = null,
  promiseToPayDate = null,
}) => {
  if (
    promiseToPayStatus === "Pending" &&
    promiseToPayDate &&
    isSameOrBeforeToday(promiseToPayDate)
  ) {
    return "Review broken promise and call customer";
  }

  if (promiseToPayStatus === "Broken") {
    return "Escalate broken promise";
  }

  if (daysOutstanding >= 90) return "Final notice / write-off review";
  if (daysOutstanding >= 60) return "Escalate to collections";
  if (daysOutstanding >= 31) return "Call customer";

  if (nextFollowUpDate && isSameOrBeforeToday(nextFollowUpDate)) {
    return "Complete scheduled follow-up";
  }

  if (collectionsStatus === "Normal") return "Send reminder";

  return "Review account";
};

const getAutomatedCollectionStatus = ({ daysOutstanding = 0, promiseToPayStatus = "None" }) => {
  if (promiseToPayStatus === "Broken") return "Collections";
  if (daysOutstanding >= 90) return "Collections";
  if (daysOutstanding >= 60) return "Overdue";
  if (daysOutstanding >= 31) return "Follow Up";
  return "Normal";
};

const buildCollectionsWorkQueue = async () => {
  const invoices = await getOpenInvoices();

  const queue = invoices.map((invoice) => {
    const balanceDue = getInvoiceReportBalance(invoice);
    const daysOutstanding = getDaysOutstanding(invoice.dueDate || invoice.createdAt);

    const promiseDue =
      invoice.promiseToPayStatus === "Pending" &&
      invoice.promiseToPayDate &&
      isSameOrBeforeToday(invoice.promiseToPayDate);

    const followUpDue =
      invoice.nextFollowUpDate && isSameOrBeforeToday(invoice.nextFollowUpDate);

    const priorityScore = getCollectionPriorityScore({
      daysOutstanding,
      balanceDue,
      collectionsStatus: invoice.collectionsStatus,
      promiseToPayStatus: invoice.promiseToPayStatus,
      nextFollowUpDate: invoice.nextFollowUpDate,
      promiseToPayDate: invoice.promiseToPayDate,
    });

    let reason = "Open receivable";

    if (promiseDue) reason = "Promise-to-pay due or overdue";
    else if (invoice.promiseToPayStatus === "Broken") reason = "Broken promise";
    else if (followUpDue) reason = "Follow-up due";
    else if (daysOutstanding >= 90) reason = "90+ days outstanding";
    else if (daysOutstanding >= 60) reason = "60+ days outstanding";
    else if (daysOutstanding >= 31) reason = "31+ days outstanding";

    const priority =
      priorityScore >= 80
        ? "Critical"
        : priorityScore >= 60
          ? "High"
          : priorityScore >= 35
            ? "Medium"
            : "Low";

    return {
      invoiceNumber: invoice.invoiceNumber,
      customerEkonId: invoice.customerEkonId,
      customerName: invoice.customerName,
      invoiceDate: invoice.createdAt,
      dueDate: invoice.dueDate || invoice.createdAt,
      balanceDue,
      amountPaid: roundMoney(invoice.amountPaid),
      finalTotal: roundMoney(invoice.finalTotal),
      daysOutstanding,
      collectionsStatus: invoice.collectionsStatus || "Normal",
      automatedStatus: getAutomatedCollectionStatus({
  daysOutstanding,
  promiseToPayStatus: invoice.promiseToPayStatus,
}),
statusChangeRecommended:
  (invoice.collectionsStatus || "Normal") !==
  getAutomatedCollectionStatus({
    daysOutstanding,
    promiseToPayStatus: invoice.promiseToPayStatus,
  }),
      assignedCollector: invoice.assignedCollector || "",
      nextFollowUpDate: invoice.nextFollowUpDate,
      promiseToPayDate: invoice.promiseToPayDate,
      promiseToPayAmount: roundMoney(invoice.promiseToPayAmount),
      promiseToPayStatus: invoice.promiseToPayStatus || "None",
      priorityScore,
      priority,
      reason,
      recommendedAction: getRecommendedCollectionAction({
        daysOutstanding,
        collectionsStatus: invoice.collectionsStatus,
        promiseToPayStatus: invoice.promiseToPayStatus,
        nextFollowUpDate: invoice.nextFollowUpDate,
        promiseToPayDate: invoice.promiseToPayDate,
      }),
      flags: {
        followUpDue,
        promiseDue,
        brokenPromise: invoice.promiseToPayStatus === "Broken",
        highRisk: priorityScore >= 60,
        over30: daysOutstanding >= 31,
        over60: daysOutstanding >= 60,
        over90: daysOutstanding >= 90,
      },
    };
  });

  const sortedQueue = queue.sort(
    (a, b) => Number(b.priorityScore || 0) - Number(a.priorityScore || 0)
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalOpenItems: sortedQueue.length,
      dueToday: sortedQueue.filter((item) => item.flags.followUpDue).length,
      brokenPromises: sortedQueue.filter((item) => item.flags.brokenPromise).length,
      promiseDue: sortedQueue.filter((item) => item.flags.promiseDue).length,
      highRisk: sortedQueue.filter((item) => item.flags.highRisk).length,
      over30: sortedQueue.filter((item) => item.flags.over30).length,
      over60: sortedQueue.filter((item) => item.flags.over60).length,
      over90: sortedQueue.filter((item) => item.flags.over90).length,
    },
    queue: sortedQueue,
  };
};

const addInvoiceCollectionNote = async ({
  invoiceNumber,
  note,
  user,
}) => {
  const invoice = await Invoice.findOne({ invoiceNumber });

  if (!invoice) {
    throw new Error("Invoice not found.");
  }

  invoice.collectionNotes = invoice.collectionNotes || [];
  invoice.collectionNotes.push({
    note,
    createdBy: user?.fullName || user?.name || user?.email || "System User",
  });

  invoice.lastCollectionContact = new Date();
  await invoice.save();

  return invoice;
};

const updateInvoiceCollectionWorkflow = async ({
  invoiceNumber,
  collectionsStatus,
  assignedCollector,
  nextFollowUpDate,
  promiseToPayDate,
  promiseToPayAmount,
  promiseToPayStatus,
}) => {
  const invoice = await Invoice.findOne({ invoiceNumber });

  if (!invoice) {
    throw new Error("Invoice not found.");
  }

  if (collectionsStatus !== undefined) invoice.collectionsStatus = collectionsStatus;
  if (assignedCollector !== undefined) invoice.assignedCollector = assignedCollector;
  if (nextFollowUpDate !== undefined) invoice.nextFollowUpDate = nextFollowUpDate || null;
  if (promiseToPayDate !== undefined) invoice.promiseToPayDate = promiseToPayDate || null;
  if (promiseToPayAmount !== undefined) invoice.promiseToPayAmount = roundMoney(promiseToPayAmount);
  if (promiseToPayStatus !== undefined) invoice.promiseToPayStatus = promiseToPayStatus;

  await invoice.save();

  return invoice;
};

module.exports = {
  buildAgingReport,
  buildCustomerStatement,
  reconcileARSubledgerToGL,
  buildARDiagnosticAudit,
  buildCollectionsDashboard,
  buildCustomerCollectionsProfile,
  buildCollectionsWorkQueue,
  addInvoiceCollectionNote,
  updateInvoiceCollectionWorkflow,
};