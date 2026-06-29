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

module.exports = {
  buildAgingReport,
  buildCustomerStatement,
  reconcileARSubledgerToGL,
};