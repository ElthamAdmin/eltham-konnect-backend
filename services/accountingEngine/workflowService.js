const { postJournalEntry } = require("./journalService");
const templates = require("./transactionTemplates");
const { roundMoney } = require("./money");

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const todayYMD = () => new Date().toISOString().slice(0, 10);

const postCustomerInvoice = async ({ invoice, user }) => {
  const amount = roundMoney(invoice.finalTotal || invoice.balanceDue || 0);

  const journalEntry = await postJournalEntry({
    entryDate: invoice.createdAt || todayYMD(),
    memo: `Invoice created for ${invoice.customerName}`,
    reference: invoice.invoiceNumber,
    sourceModule: "Invoices",
    createdBy: getUserName(user),
    lines: templates.buildCustomerInvoiceLines({ amount }),
  });

  return journalEntry;
};

const receiveInvoicePayment = async ({
  invoice,
  receivingAccount,
  amount,
  user,
}) => {
  const paymentAmount = roundMoney(amount || invoice.balanceDue || invoice.finalTotal || 0);

  const journalEntry = await postJournalEntry({
    entryDate: todayYMD(),
    memo: `Invoice payment received from ${invoice.customerName}`,
    reference: invoice.invoiceNumber,
    sourceModule: "Invoices",
    createdBy: getUserName(user),
    lines: templates.buildInvoicePaymentLines({
      receivingAccount,
      amount: paymentAmount,
    }),
  });

  return journalEntry;
};

const postOwnerDeposit = async ({
  financialAccount,
  amount,
  reference,
  notes,
  user,
}) => {
  return postJournalEntry({
    entryDate: todayYMD(),
    memo: `Owner deposit into ${financialAccount.accountName}`,
    reference: reference || "Owner Deposit",
    sourceModule: "Banking",
    createdBy: getUserName(user),
    lines: templates.buildOwnerDepositLines({
      financialAccount,
      amount,
      notes,
    }),
  });
};

const postOwnerDrawing = async ({
  financialAccount,
  amount,
  reference,
  notes,
  user,
}) => {
  return postJournalEntry({
    entryDate: todayYMD(),
    memo: `Owner drawing from ${financialAccount.accountName}`,
    reference: reference || "Owner Drawing",
    sourceModule: "Banking",
    createdBy: getUserName(user),
    lines: templates.buildOwnerDrawingLines({
      financialAccount,
      amount,
      notes,
    }),
  });
};

const transferFunds = async ({
  fromAccount,
  toAccount,
  amount,
  reference,
  notes,
  user,
}) => {
  return postJournalEntry({
    entryDate: todayYMD(),
    memo: reference || `Transfer ${fromAccount.accountName} to ${toAccount.accountName}`,
    reference: reference || "Account Transfer",
    sourceModule: "Banking",
    createdBy: getUserName(user),
    lines: templates.buildTransferLines({
      fromAccount,
      toAccount,
      amount,
      notes,
    }),
  });
};

const postExpensePayment = async ({
  expenseAccountCode,
  paymentAccount,
  amount,
  description,
  reference,
  user,
}) => {
  return postJournalEntry({
    entryDate: todayYMD(),
    memo: description || "Expense payment",
    reference: reference || "Expense",
    sourceModule: "Expenses",
    createdBy: getUserName(user),
    lines: templates.buildExpensePaymentLines({
      expenseAccountCode,
      paymentAccount,
      amount,
      description,
    }),
  });
};

const postPayrollPayment = async ({
  paymentAccount,
  payroll,
  user,
}) => {
  return postJournalEntry({
    entryDate: todayYMD(),
    memo: `Payroll payment for ${payroll.employeeName}`,
    reference: `Payroll ${payroll.payPeriod}`,
    sourceModule: "Payroll",
    createdBy: getUserName(user),
    lines: templates.buildPayrollPaymentLines({
      paymentAccount,
      grossPay: payroll.grossPay,
      nisEmployee: payroll.nisEmployee,
      nhtEmployee: payroll.nhtEmployee,
      educationTax: payroll.educationTax,
      incomeTax: payroll.incomeTax,
      pensionEmployee: payroll.pensionEmployee,
      netPay: payroll.netPay,
      employeeName: payroll.employeeName,
    }),
  });
};

module.exports = {
  postCustomerInvoice,
  receiveInvoicePayment,
  postOwnerDeposit,
  postOwnerDrawing,
  transferFunds,
  postExpensePayment,
  postPayrollPayment,
};