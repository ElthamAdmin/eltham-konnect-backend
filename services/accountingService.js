const {
  postJournalEntry,
  SYSTEM_ACCOUNTS,
} = require("../utils/generalLedgerPoster");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const postCustomerInvoice = async ({ invoice, user }) => {
  const amount = roundMoney(invoice.finalTotal || 0);

  if (amount <= 0) {
    throw new Error("Invoice amount must be greater than zero.");
  }

  return postJournalEntry({
    entryDate: invoice.createdAt || new Date().toISOString().slice(0, 10),
    memo: `Invoice created for ${invoice.customerName}`,
    reference: invoice.invoiceNumber,
    sourceModule: "Invoices",
    createdBy: getUserName(user),
    lines: [
      {
        accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        debit: amount,
        credit: 0,
        description: "Customer invoice receivable",
      },
      {
        accountCode: SYSTEM_ACCOUNTS.SHIPPING_REVENUE,
        debit: 0,
        credit: amount,
        description: "Shipping revenue earned",
      },
    ],
  });
};

const receiveInvoicePayment = async ({ invoice, receivingAccount, amount, user }) => {
  const paymentAmount = roundMoney(amount || invoice.balanceDue || invoice.finalTotal || 0);

  if (paymentAmount <= 0) {
    throw new Error("Invoice payment amount must be greater than zero.");
  }

  if (!receivingAccount?.linkedChartAccountCode) {
    throw new Error("Receiving financial account is not linked to the Chart of Accounts.");
  }

  return postJournalEntry({
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `Invoice payment received from ${invoice.customerName}`,
    reference: invoice.invoiceNumber,
    sourceModule: "Invoices",
    createdBy: getUserName(user),
    lines: [
      {
        accountCode: receivingAccount.linkedChartAccountCode,
        debit: paymentAmount,
        credit: 0,
        description: "Cash received from customer",
      },
      {
        accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        debit: 0,
        credit: paymentAmount,
        description: "Customer receivable cleared",
      },
    ],
  });
};

const postOwnerDeposit = async ({ financialAccount, amount, reference, notes, user }) => {
  const numericAmount = roundMoney(amount);

  if (!financialAccount?.linkedChartAccountCode) {
    throw new Error("Financial account is not linked to the Chart of Accounts.");
  }

  return postJournalEntry({
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `Owner deposit into ${financialAccount.accountName}`,
    reference: reference || "Owner Deposit",
    sourceModule: "Banking",
    createdBy: getUserName(user),
    lines: [
      {
        accountCode: financialAccount.linkedChartAccountCode,
        debit: numericAmount,
        credit: 0,
        description: notes || "Owner capital injection",
      },
      {
        accountCode: SYSTEM_ACCOUNTS.OWNER_EQUITY,
        debit: 0,
        credit: numericAmount,
        description: notes || "Owner capital injection",
      },
    ],
  });
};

const postOwnerDrawing = async ({ financialAccount, amount, reference, notes, user }) => {
  const numericAmount = roundMoney(amount);

  if (!financialAccount?.linkedChartAccountCode) {
    throw new Error("Financial account is not linked to the Chart of Accounts.");
  }

  return postJournalEntry({
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `Owner drawing from ${financialAccount.accountName}`,
    reference: reference || "Owner Drawing",
    sourceModule: "Banking",
    createdBy: getUserName(user),
    lines: [
      {
        accountCode: SYSTEM_ACCOUNTS.OWNER_DRAWINGS,
        debit: numericAmount,
        credit: 0,
        description: notes || "Owner withdrawal",
      },
      {
        accountCode: financialAccount.linkedChartAccountCode,
        debit: 0,
        credit: numericAmount,
        description: notes || "Owner withdrawal",
      },
    ],
  });
};

const transferFunds = async ({ fromAccount, toAccount, amount, reference, notes, user }) => {
  const numericAmount = roundMoney(amount);

  if (!fromAccount?.linkedChartAccountCode || !toAccount?.linkedChartAccountCode) {
    throw new Error("Both financial accounts must be linked to Chart of Accounts.");
  }

  return postJournalEntry({
    entryDate: new Date().toISOString().slice(0, 10),
    memo: reference || `Transfer ${fromAccount.accountName} to ${toAccount.accountName}`,
    reference: reference || "Account Transfer",
    sourceModule: "Banking",
    createdBy: getUserName(user),
    lines: [
      {
        accountCode: toAccount.linkedChartAccountCode,
        debit: numericAmount,
        credit: 0,
        description: notes || "Transfer in",
      },
      {
        accountCode: fromAccount.linkedChartAccountCode,
        debit: 0,
        credit: numericAmount,
        description: notes || "Transfer out",
      },
    ],
  });
};

module.exports = {
  postCustomerInvoice,
  receiveInvoicePayment,
  postOwnerDeposit,
  postOwnerDrawing,
  transferFunds,
};