const Invoice = require("../models/Invoice");
const Customer = require("../models/Customer");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

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
    const balanceDue = roundMoney(
      invoice.balanceDue > 0
        ? invoice.balanceDue
        : Number(invoice.finalTotal || 0) - Number(invoice.amountPaid || 0)
    );

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

  if (!customer) {
    throw new Error("Customer not found.");
  }

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
    balanceDue: roundMoney(
      invoice.balanceDue > 0
        ? invoice.balanceDue
        : Number(invoice.finalTotal || 0) - Number(invoice.amountPaid || 0)
    ),
    paymentHistory: invoice.paymentHistory || [],
  }));

  const totalInvoiced = roundMoney(
    rows.reduce((sum, row) => sum + Number(row.finalTotal || 0), 0)
  );

  const totalPaid = roundMoney(
    rows.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0)
  );

  const totalOutstanding = roundMoney(
    rows.reduce((sum, row) => sum + Number(row.balanceDue || 0), 0)
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
    invoices.reduce((sum, invoice) => {
      const balanceDue =
        invoice.balanceDue > 0
          ? invoice.balanceDue
          : Number(invoice.finalTotal || 0) - Number(invoice.amountPaid || 0);
      return sum + Number(balanceDue || 0);
    }, 0)
  );

  const glLines = await GeneralLedgerTransaction.find({
    accountCode: "1100",
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

const buildARDiagnosticAudit = async () => {
  const invoices = await Invoice.find().sort({
    createdAt: 1,
    invoiceNumber: 1,
  });

  const arLedgerLines = await GeneralLedgerTransaction.find({
    accountCode: "1100",
  }).sort({
    entryDate: 1,
    createdAt: 1,
  });

  const invoiceMap = {};

  invoices.forEach((invoice) => {
    const expectedBalance = roundMoney(
      Number(invoice.finalTotal || 0) - Number(invoice.amountPaid || 0)
    );

    invoiceMap[invoice.invoiceNumber] = {
      invoiceNumber: invoice.invoiceNumber,
      customerEkonId: invoice.customerEkonId,
      customerName: invoice.customerName,
      status: invoice.status,
      finalTotal: roundMoney(invoice.finalTotal),
      amountPaid: roundMoney(invoice.amountPaid),
      storedBalanceDue: roundMoney(invoice.balanceDue),
      expectedBalanceDue: expectedBalance,
      invoiceBalanceMismatch: roundMoney(
        Number(invoice.balanceDue || 0) - expectedBalance
      ),
      ledgerDebit: 0,
      ledgerCredit: 0,
      ledgerBalance: 0,
      ledgerDifference: 0,
      relatedLedgerLines: [],
    };
  });

  const orphanLedgerLines = [];

  arLedgerLines.forEach((line) => {
    const reference = line.reference || line.memo || "";
    const invoiceNumber = Object.keys(invoiceMap).find((number) =>
      String(reference).includes(number)
    );

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
    const expectedBalanceDue = roundMoney(row.expectedBalanceDue);

    return {
      ...row,
      ledgerBalance,
      ledgerDifference: roundMoney(ledgerBalance - expectedBalanceDue),
      hasIssue:
        roundMoney(row.invoiceBalanceMismatch) !== 0 ||
        roundMoney(ledgerBalance - expectedBalanceDue) !== 0,
    };
  });

  const issueRows = rows.filter((row) => row.hasIssue);

  const invoiceSubledgerBalance = roundMoney(
    rows
      .filter((row) => ["Unpaid", "Partially Paid"].includes(row.status))
      .reduce((sum, row) => sum + Number(row.expectedBalanceDue || 0), 0)
  );

  const glARBalance = roundMoney(
    arLedgerLines.reduce(
      (sum, line) => sum + Number(line.debit || 0) - Number(line.credit || 0),
      0
    )
  );

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      invoiceSubledgerBalance,
      glARBalance,
      difference: roundMoney(invoiceSubledgerBalance - glARBalance),
      isReconciled: roundMoney(invoiceSubledgerBalance - glARBalance) === 0,
      invoiceCount: rows.length,
      issueCount: issueRows.length,
      orphanLedgerLineCount: orphanLedgerLines.length,
    },
    issues: issueRows,
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