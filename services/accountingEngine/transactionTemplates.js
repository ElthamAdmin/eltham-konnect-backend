const { SYSTEM_ACCOUNTS } = require("./accountingConstants");
const { roundMoney } = require("./money");

const requirePositiveAmount = (amount, label = "Amount") => {
  const value = roundMoney(amount);

  if (value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return value;
};

const requireLinkedAccount = (financialAccount, label = "Financial account") => {
  if (!financialAccount?.linkedChartAccountCode) {
    throw new Error(`${label} is not linked to the Chart of Accounts.`);
  }
};

const buildCustomerInvoiceLines = ({ amount }) => {
  const value = requirePositiveAmount(amount, "Invoice amount");

  return [
    {
      accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
      debit: value,
      credit: 0,
      description: "Customer invoice receivable",
    },
    {
      accountCode: SYSTEM_ACCOUNTS.SHIPPING_REVENUE,
      debit: 0,
      credit: value,
      description: "Shipping revenue earned",
    },
  ];
};

const buildInvoicePaymentLines = ({ receivingAccount, amount }) => {
  const value = requirePositiveAmount(amount, "Payment amount");
  requireLinkedAccount(receivingAccount, "Receiving account");

  return [
    {
      accountCode: receivingAccount.linkedChartAccountCode,
      debit: value,
      credit: 0,
      description: "Cash received from customer",
    },
    {
      accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
      debit: 0,
      credit: value,
      description: "Customer receivable cleared",
    },
  ];
};

const buildOwnerDepositLines = ({ financialAccount, amount, notes = "" }) => {
  const value = requirePositiveAmount(amount, "Owner deposit amount");
  requireLinkedAccount(financialAccount);

  return [
    {
      accountCode: financialAccount.linkedChartAccountCode,
      debit: value,
      credit: 0,
      description: notes || "Owner capital injection",
    },
    {
      accountCode: SYSTEM_ACCOUNTS.OWNER_CAPITAL,
      debit: 0,
      credit: value,
      description: notes || "Owner capital injection",
    },
  ];
};

const buildOwnerDrawingLines = ({ financialAccount, amount, notes = "" }) => {
  const value = requirePositiveAmount(amount, "Owner drawing amount");
  requireLinkedAccount(financialAccount);

  return [
    {
      accountCode: SYSTEM_ACCOUNTS.OWNER_DRAWINGS,
      debit: value,
      credit: 0,
      description: notes || "Owner withdrawal",
    },
    {
      accountCode: financialAccount.linkedChartAccountCode,
      debit: 0,
      credit: value,
      description: notes || "Owner withdrawal",
    },
  ];
};

const buildTransferLines = ({ fromAccount, toAccount, amount, notes = "" }) => {
  const value = requirePositiveAmount(amount, "Transfer amount");
  requireLinkedAccount(fromAccount, "Source account");
  requireLinkedAccount(toAccount, "Destination account");

  return [
    {
      accountCode: toAccount.linkedChartAccountCode,
      debit: value,
      credit: 0,
      description: notes || "Transfer in",
    },
    {
      accountCode: fromAccount.linkedChartAccountCode,
      debit: 0,
      credit: value,
      description: notes || "Transfer out",
    },
  ];
};

const buildExpensePaymentLines = ({
  expenseAccountCode,
  paymentAccount,
  amount,
  description = "",
}) => {
  const value = requirePositiveAmount(amount, "Expense amount");
  requireLinkedAccount(paymentAccount, "Payment account");

  if (!expenseAccountCode) {
    throw new Error("Expense account code is required.");
  }

  return [
    {
      accountCode: expenseAccountCode,
      debit: value,
      credit: 0,
      description: description || "Business expense",
    },
    {
      accountCode: paymentAccount.linkedChartAccountCode,
      debit: 0,
      credit: value,
      description: description || "Expense payment",
    },
  ];
};

const buildPayrollPaymentLines = ({
  paymentAccount,
  grossPay,
  nisEmployee = 0,
  nhtEmployee = 0,
  educationTax = 0,
  incomeTax = 0,
  pensionEmployee = 0,
  netPay,
  employeeName = "",
}) => {
  requireLinkedAccount(paymentAccount, "Payroll payment account");

  const gross = requirePositiveAmount(grossPay, "Gross payroll");
  const net = requirePositiveAmount(netPay, "Net payroll");

  const lines = [
    {
      accountCode: SYSTEM_ACCOUNTS.PAYROLL_EXPENSE,
      debit: gross,
      credit: 0,
      description: `Gross payroll expense${employeeName ? ` for ${employeeName}` : ""}`,
    },
  ];

  const liabilities = [
    [SYSTEM_ACCOUNTS.NIS_PAYABLE, nisEmployee, "NIS payable"],
    [SYSTEM_ACCOUNTS.NHT_PAYABLE, nhtEmployee, "NHT payable"],
    [SYSTEM_ACCOUNTS.EDUCATION_TAX_PAYABLE, educationTax, "Education tax payable"],
    [SYSTEM_ACCOUNTS.PAYE_PAYABLE, incomeTax, "PAYE payable"],
    [SYSTEM_ACCOUNTS.PENSION_PAYABLE, pensionEmployee, "Pension payable"],
  ];

  liabilities.forEach(([accountCode, amount, label]) => {
    const value = roundMoney(amount);
    if (value > 0) {
      lines.push({
        accountCode,
        debit: 0,
        credit: value,
        description: `${label}${employeeName ? ` for ${employeeName}` : ""}`,
      });
    }
  });

  lines.push({
    accountCode: paymentAccount.linkedChartAccountCode,
    debit: 0,
    credit: net,
    description: `Payroll paid${employeeName ? ` to ${employeeName}` : ""}`,
  });

  return lines;
};

module.exports = {
  requirePositiveAmount,
  requireLinkedAccount,
  buildCustomerInvoiceLines,
  buildInvoicePaymentLines,
  buildOwnerDepositLines,
  buildOwnerDrawingLines,
  buildTransferLines,
  buildExpensePaymentLines,
  buildPayrollPaymentLines,
};