const { SYSTEM_ACCOUNTS } = require("./accountingConstants");
const { roundMoney } = require("./money");

const requirePositiveAmount = (amount, label = "Amount") => {
  const value = roundMoney(amount);

  if (value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return value;
};

const TAX_PAYABLE_ACCOUNT_MAP = {
  PAYE: SYSTEM_ACCOUNTS.PAYE_PAYABLE,
  NIS: SYSTEM_ACCOUNTS.NIS_PAYABLE,
  NHT: SYSTEM_ACCOUNTS.NHT_PAYABLE,
  "Education Tax":
    SYSTEM_ACCOUNTS.EDUCATION_TAX_PAYABLE,
  Pension: SYSTEM_ACCOUNTS.PENSION_PAYABLE,
  HEART: SYSTEM_ACCOUNTS.HEART_PAYABLE,
  GCT: SYSTEM_ACCOUNTS.GCT_OUTPUT_TAX_PAYABLE,
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

const buildVendorBillLines = ({
  expenseAccountCode,
  amount,
  description = "",
}) => {
  const value = requirePositiveAmount(amount, "Vendor bill amount");

  if (!expenseAccountCode) {
    throw new Error("Expense account code is required for vendor bill.");
  }

  return [
    {
      accountCode: expenseAccountCode,
      debit: value,
      credit: 0,
      description: description || "Vendor bill expense",
    },
    {
      accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE,
      debit: 0,
      credit: value,
      description: description || "Accounts payable liability",
    },
  ];
};

const buildVendorPaymentLines = ({
  paymentAccount,
  amount,
  description = "",
}) => {
  const value = requirePositiveAmount(amount, "Vendor payment amount");
  requireLinkedAccount(paymentAccount, "Payment account");

  return [
    {
      accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE,
      debit: value,
      credit: 0,
      description: description || "Accounts payable cleared",
    },
    {
      accountCode: paymentAccount.linkedChartAccountCode,
      debit: 0,
      credit: value,
      description: description || "Vendor payment",
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

const buildEmployeeAdvanceFundingLines = ({
  paymentAccount,
  amount,
  advanceNumber,
  employeeId,
  employeeName,
  description = "",
}) => {
  requireLinkedAccount(paymentAccount, "Employee advance payment account");

  const value = requirePositiveAmount(amount, "Employee advance amount");
  const employeeReference =
    employeeName || employeeId || "employee";

  return [
    {
      accountCode: SYSTEM_ACCOUNTS.EMPLOYEE_ADVANCES_RECEIVABLE,
      debit: value,
      credit: 0,
      description:
        description ||
        `${advanceNumber} - Advance receivable from ${employeeReference}`,
    },
    {
      accountCode: paymentAccount.linkedChartAccountCode,
      debit: 0,
      credit: value,
      description:
        description ||
        `${advanceNumber} - Payment made on behalf of ${employeeReference}`,
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
  nisEmployer = 0,
  nhtEmployer = 0,
  educationTaxEmployer = 0,
  heartEmployer = 0,
    advanceRecovery = 0,
  netPay,
  employeeName = "",
}) => {
  requireLinkedAccount(paymentAccount, "Payroll payment account");

  const gross = requirePositiveAmount(grossPay, "Gross payroll");
  const net = requirePositiveAmount(netPay, "Net payroll");

  const employeeNis = Math.max(0, roundMoney(nisEmployee));
  const employeeNht = Math.max(0, roundMoney(nhtEmployee));
  const employeeEducationTax = Math.max(0, roundMoney(educationTax));
  const employeePaye = Math.max(0, roundMoney(incomeTax));
  const employeePension = Math.max(0, roundMoney(pensionEmployee));

  const employerNis = Math.max(0, roundMoney(nisEmployer));
  const employerNht = Math.max(0, roundMoney(nhtEmployer));
  const employerEducationTax = Math.max(
    0,
    roundMoney(educationTaxEmployer)
  );
    const employerHeart = Math.max(0, roundMoney(heartEmployer));
  const employeeAdvanceRecovery = Math.max(
    0,
    roundMoney(advanceRecovery)
  );

  const totalEmployerContributions = roundMoney(
    employerNis +
      employerNht +
      employerEducationTax +
      employerHeart
  );

  const lines = [
    {
      accountCode: SYSTEM_ACCOUNTS.PAYROLL_EXPENSE,
      debit: gross,
      credit: 0,
      description: `Gross payroll expense${
        employeeName ? ` for ${employeeName}` : ""
      }`,
    },
  ];

  if (totalEmployerContributions > 0) {
    lines.push({
      accountCode:
        SYSTEM_ACCOUNTS.EMPLOYER_PAYROLL_CONTRIBUTION_EXPENSE,
      debit: totalEmployerContributions,
      credit: 0,
      description: `Employer statutory contributions${
        employeeName ? ` for ${employeeName}` : ""
      }`,
    });
  }

  const liabilities = [
    [
      SYSTEM_ACCOUNTS.NIS_PAYABLE,
      roundMoney(employeeNis + employerNis),
      "NIS payable",
    ],
    [
      SYSTEM_ACCOUNTS.NHT_PAYABLE,
      roundMoney(employeeNht + employerNht),
      "NHT payable",
    ],
    [
      SYSTEM_ACCOUNTS.EDUCATION_TAX_PAYABLE,
      roundMoney(employeeEducationTax + employerEducationTax),
      "Education Tax payable",
    ],
    [
      SYSTEM_ACCOUNTS.PAYE_PAYABLE,
      employeePaye,
      "PAYE payable",
    ],
    [
      SYSTEM_ACCOUNTS.PENSION_PAYABLE,
      employeePension,
      "Pension payable",
    ],
    [
      SYSTEM_ACCOUNTS.HEART_PAYABLE,
      employerHeart,
      "HEART payable",
    ],
  ];

    if (employeeAdvanceRecovery > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNTS.EMPLOYEE_ADVANCES_RECEIVABLE,
      debit: 0,
      credit: employeeAdvanceRecovery,
      description: `Employee advance recovered${
        employeeName ? ` from ${employeeName}` : ""
      }`,
    });
  }

  liabilities.forEach(([accountCode, amount, label]) => {
    const value = roundMoney(amount);

    if (value > 0) {
      lines.push({
        accountCode,
        debit: 0,
        credit: value,
        description: `${label}${
          employeeName ? ` for ${employeeName}` : ""
        }`,
      });
    }
  });

  lines.push({
    accountCode: paymentAccount.linkedChartAccountCode,
    debit: 0,
    credit: net,
    description: `Payroll paid${
      employeeName ? ` to ${employeeName}` : ""
    }`,
  });

  const totalDebit = roundMoney(
    lines.reduce((sum, line) => sum + Number(line.debit || 0), 0)
  );

  const totalCredit = roundMoney(
    lines.reduce((sum, line) => sum + Number(line.credit || 0), 0)
  );

  if (totalDebit !== totalCredit) {
    throw new Error(
      `Payroll journal is not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`
    );
  }

  return lines;
};

const buildGctFilingSettlementLines = ({
  outputGct,
  inputGctCredit,
  description = "",
}) => {
  const outputTax = Math.max(
    0,
    roundMoney(outputGct)
  );

  const inputCredit = Math.max(
    0,
    roundMoney(inputGctCredit)
  );

  const offsetAmount = Math.min(
    outputTax,
    inputCredit
  );

  if (offsetAmount <= 0) {
    return [];
  }

  const settlementDescription =
    description ||
    "GCT input tax credit offset against output GCT";

  return [
    {
      accountCode:
        SYSTEM_ACCOUNTS.GCT_OUTPUT_TAX_PAYABLE,
      debit: offsetAmount,
      credit: 0,
      description: settlementDescription,
    },
    {
      accountCode:
        SYSTEM_ACCOUNTS.GCT_INPUT_TAX_RECOVERABLE,
      debit: 0,
      credit: offsetAmount,
      description: settlementDescription,
    },
  ];
};


const buildTaxLiabilityPaymentLines = ({
  paymentAccount,
  taxType,
  amount,
  description = "",
}) => {
  requireLinkedAccount(
    paymentAccount,
    "Tax payment account"
  );

  const value = requirePositiveAmount(
    amount,
    "Tax payment amount"
  );

  const payableAccountCode =
    TAX_PAYABLE_ACCOUNT_MAP[String(taxType || "").trim()];

  if (!payableAccountCode) {
    throw new Error(
      `No statutory payable account is configured for ${taxType}.`
    );
  }

  const paymentDescription =
    description ||
    `${taxType} statutory liability payment`;

  return [
    {
      accountCode: payableAccountCode,
      debit: value,
      credit: 0,
      description: paymentDescription,
    },
    {
      accountCode:
        paymentAccount.linkedChartAccountCode,
      debit: 0,
      credit: value,
      description: paymentDescription,
    },
  ];
};

const buildCustomerPurchaseFundingLines = ({
  paymentAccount,
  amount,
  description = "",
}) => {
  const value = requirePositiveAmount(
    amount,
    "Customer purchase base-currency amount"
  );

  requireLinkedAccount(paymentAccount, "Customer purchase payment account");

  return [
    {
      accountCode: SYSTEM_ACCOUNTS.CUSTOMER_PURCHASE_RECOVERABLE,
      debit: value,
      credit: 0,
      description:
        description || "Amount paid on behalf of customer",
    },
    {
      accountCode: paymentAccount.linkedChartAccountCode,
      debit: 0,
      credit: value,
      description:
        description || "Customer purchase funded from financial account",
    },
  ];
};

const buildCustomerPurchaseRefundLines = ({
  paymentAccount,
  amount,
  description = "",
}) => {
  const value = requirePositiveAmount(
    amount,
    "Customer purchase refund amount"
  );

  requireLinkedAccount(paymentAccount, "Customer purchase refund account");

  return [
    {
      accountCode: paymentAccount.linkedChartAccountCode,
      debit: value,
      credit: 0,
      description:
        description || "Refund received to original payment account",
    },
    {
      accountCode: SYSTEM_ACCOUNTS.CUSTOMER_PURCHASE_RECOVERABLE,
      debit: 0,
      credit: value,
      description:
        description || "Customer purchase recoverable reduced by refund",
    },
  ];
};

const buildCustomerPurchaseRecoveryInvoiceLines = ({
  recoverableAmount = 0,
  shoppingServiceFee = 0,
  shippingRevenue = 0,
  deliveryRevenue = 0,
  otherServiceRevenue = 0,
}) => {
  const recovery = roundMoney(recoverableAmount);
  const shoppingFee = roundMoney(shoppingServiceFee);
  const shipping = roundMoney(shippingRevenue);
  const delivery = roundMoney(deliveryRevenue);
  const otherRevenue = roundMoney(otherServiceRevenue);

  const totalInvoiceAmount = roundMoney(
    recovery + shoppingFee + shipping + delivery + otherRevenue
  );

  requirePositiveAmount(
    totalInvoiceAmount,
    "Customer purchase recovery invoice amount"
  );

  const lines = [
    {
      accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
      debit: totalInvoiceAmount,
      credit: 0,
      description: "Customer purchase recovery invoice receivable",
    },
  ];

  if (recovery > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNTS.CUSTOMER_PURCHASE_RECOVERABLE,
      debit: 0,
      credit: recovery,
      description: "Customer purchase recoverable cleared through invoice",
    });
  }

  if (shoppingFee > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNTS.SHOPPING_SERVICE_REVENUE,
      debit: 0,
      credit: shoppingFee,
      description: "Shopping assistance service revenue",
    });
  }

  if (shipping > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNTS.SHIPPING_REVENUE,
      debit: 0,
      credit: shipping,
      description: "Shipping revenue",
    });
  }

  if (delivery > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNTS.DELIVERY_REVENUE,
      debit: 0,
      credit: delivery,
      description: "Delivery revenue",
    });
  }

  if (otherRevenue > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNTS.MARKETPLACE_REVENUE,
      debit: 0,
      credit: otherRevenue,
      description: "Other shopping assistance revenue",
    });
  }

  return lines;
};

module.exports = {
  requirePositiveAmount,
  requireLinkedAccount,
  buildCustomerInvoiceLines,
  buildInvoicePaymentLines,
  buildVendorBillLines,
  buildVendorPaymentLines,
  buildOwnerDepositLines,
  buildOwnerDrawingLines,
  buildTransferLines,
  buildExpensePaymentLines,
  buildEmployeeAdvanceFundingLines,
  buildPayrollPaymentLines,
  buildGctFilingSettlementLines,
  buildTaxLiabilityPaymentLines,
  buildCustomerPurchaseFundingLines,
  buildCustomerPurchaseRefundLines,
  buildCustomerPurchaseRecoveryInvoiceLines,
};