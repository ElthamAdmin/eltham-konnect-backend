const { postJournalEntry } = require("./journalService");
const templates = require("./transactionTemplates");
const { roundMoney } = require("./money");

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const todayYMD = () => new Date().toISOString().slice(0, 10);

const normalizePostingDate = (dateValue) => {
  if (!dateValue) return todayYMD();

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return todayYMD();
  }

  return date.toISOString().slice(0, 10);
};

const postCustomerInvoice = async ({ invoice, user }) => {
  const amount = roundMoney(invoice.finalTotal || invoice.balanceDue || 0);

  return postJournalEntry({
    entryDate: normalizePostingDate(invoice.createdAt || invoice.invoiceDate),
    memo: `Invoice created for ${invoice.customerName}`,
    reference: invoice.invoiceNumber,
    sourceModule: "Invoices",
    createdBy: getUserName(user),
    lines: templates.buildCustomerInvoiceLines({ amount }),
  });
};

const receiveInvoicePayment = async ({
  invoice,
  receivingAccount,
  amount,
  paymentDate,
  user,
}) => {
  const paymentAmount = roundMoney(
    amount || invoice.balanceDue || invoice.finalTotal || 0
  );

  return postJournalEntry({
    entryDate: normalizePostingDate(paymentDate || new Date()),
    memo: `Invoice payment received from ${invoice.customerName}`,
    reference: invoice.invoiceNumber,
    sourceModule: "Invoices",
    createdBy: getUserName(user),
    lines: templates.buildInvoicePaymentLines({
      receivingAccount,
      amount: paymentAmount,
    }),
  });
};

const postVendorBill = async ({
  payable,
  expenseAccountCode,
  amount,
  user,
}) => {
  const billAmount = roundMoney(amount || payable.amount || 0);

  return postJournalEntry({
    entryDate: normalizePostingDate(payable.payableDate),
    memo: `Vendor bill from ${payable.vendorName}`,
    reference: payable.payableNumber,
    sourceModule: "Accounts Payable",
    createdBy: getUserName(user),
    lines: templates.buildVendorBillLines({
      expenseAccountCode,
      amount: billAmount,
      description: payable.description || `Vendor bill ${payable.payableNumber}`,
    }),
  });
};

const payVendorBill = async ({
  payable,
  paymentAccount,
  amount,
  paymentDate,
  paymentReference,
  user,
}) => {
  const paymentAmount = roundMoney(amount || payable.balanceDue || 0);

  return postJournalEntry({
    entryDate: normalizePostingDate(paymentDate),
    memo: `Payment to ${payable.vendorName} for ${payable.payableNumber}`,
    reference: paymentReference || payable.payableNumber,
    sourceModule: "Accounts Payable",
    createdBy: getUserName(user),
    lines: templates.buildVendorPaymentLines({
      paymentAccount,
      amount: paymentAmount,
      description: `AP payment ${payable.payableNumber}`,
    }),
  });
};

const postOwnerDeposit = async ({
  financialAccount,
  amount,
  reference,
  notes,
  transactionDate,
  user,
}) => {
  return postJournalEntry({
    entryDate: normalizePostingDate(transactionDate),
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
  transactionDate,
  user,
}) => {
  return postJournalEntry({
    entryDate: normalizePostingDate(transactionDate),
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
  transactionDate,
  user,
}) => {
  return postJournalEntry({
    entryDate: normalizePostingDate(transactionDate),
    memo:
      reference ||
      `Transfer ${fromAccount.accountName} to ${toAccount.accountName}`,
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
  expenseDate,
  transactionDate,
  user,
}) => {
  return postJournalEntry({
    entryDate: normalizePostingDate(expenseDate || transactionDate),
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

const postEmployeeAdvanceFunding = async ({
  paymentAccount,
  amount,
  advanceNumber,
  employeeId,
  employeeName,
  description,
  advanceDate,
  user,
}) => {
  return postJournalEntry({
    entryDate: normalizePostingDate(advanceDate),
    memo:
      description ||
      `Employee advance funded for ${employeeName || employeeId}`,
    reference: advanceNumber,
    sourceModule: "Payroll",
    createdBy: getUserName(user),
    lines: templates.buildEmployeeAdvanceFundingLines({
      paymentAccount,
      amount,
      advanceNumber,
      employeeId,
      employeeName,
      description,
    }),
  });
};

const postPayrollPayment = async ({
  paymentAccount,
  payroll,
  paymentDate,
  user,
}) => {
  return postJournalEntry({
    entryDate: normalizePostingDate(
      paymentDate || payroll.paymentDate || payroll.payDate
    ),
    memo: `Payroll payment for ${payroll.employeeName}`,
    reference: payroll.payrollNumber || `Payroll ${payroll.payPeriod}`,
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
      nisEmployer: payroll.nisEmployer,
      nhtEmployer: payroll.nhtEmployer,
      educationTaxEmployer: payroll.educationTaxEmployer,
      heartEmployer: payroll.heartEmployer,
      advanceRecovery: payroll.advanceRecovery,
      netPay: payroll.netPay,
      employeeName: payroll.employeeName,
    }),
  });
};

const postTaxLiabilityPayment = async ({
  taxRecord,
  paymentAccount,
  amount,
  paymentDate,
  paymentReference,
  user,
}) => {
  const paymentAmount = roundMoney(amount);

  return postJournalEntry({
    entryDate: normalizePostingDate(
      paymentDate || new Date()
    ),

    memo:
      `${taxRecord.taxType} payment for ` +
      `${taxRecord.periodKey || taxRecord.periodStart}`,

    reference:
      paymentReference || taxRecord.taxNumber,

    sourceModule: "Tax Center",

    createdBy: getUserName(user),

    lines: templates.buildTaxLiabilityPaymentLines({
      paymentAccount,
      taxType: taxRecord.taxType,
      amount: paymentAmount,
      description:
        `${taxRecord.taxType} liability payment ` +
        `${taxRecord.taxNumber}`,
    }),
  });
};

const postGctFilingSettlement = async ({
  filingPeriod,
  postingDate,
  user,
}) => {
  if (!filingPeriod) {
    throw new Error(
      "A GCT filing period is required."
    );
  }

  if (
    filingPeriod.calculationMode !==
      "Compliance" ||
    filingPeriod.registrationStatus !==
      "Registered" ||
    !filingPeriod.canFileReturn
  ) {
    throw new Error(
      "Only a registered Compliance GCT filing period can post a settlement journal."
    );
  }

  const lines =
    templates.buildGctFilingSettlementLines({
      outputGct:
        filingPeriod.outputGct,

      inputGctCredit:
        filingPeriod.inputGctCredit,

      description:
        `GCT filing settlement ${filingPeriod.filingNumber}`,
    });

  if (lines.length === 0) {
    return null;
  }

  return postJournalEntry({
    entryDate: normalizePostingDate(
      postingDate ||
        filingPeriod.periodEnd ||
        new Date()
    ),

    memo:
      `GCT input credit offset for ` +
      `${filingPeriod.periodKey}`,

    reference:
      filingPeriod.filingNumber,

    sourceModule: "Tax Center",

    createdBy: getUserName(user),

    lines,
  });
};


const postCustomerPurchase = async ({
  purchase,
  paymentAccount,
  user,
}) => {
  const baseCurrencyAmount = roundMoney(
    purchase.baseCurrencyAmount ||
      Number(purchase.purchaseAmount || 0) *
        Number(purchase.exchangeRate || 1)
  );

  return postJournalEntry({
    entryDate: normalizePostingDate(purchase.purchaseDate),
    memo: `Customer purchase for ${purchase.customerName} from ${purchase.merchant}`,
    reference: purchase.purchaseNumber,
    sourceModule: "Customer Purchases",
    createdBy: getUserName(user),
    lines: templates.buildCustomerPurchaseFundingLines({
      paymentAccount,
      amount: baseCurrencyAmount,
      description: `${purchase.purchaseNumber} - ${purchase.customerName} - ${purchase.merchant}`,
    }),
  });
};

const refundCustomerPurchase = async ({
  purchase,
  paymentAccount,
  refundAmount,
  refundDate,
  user,
}) => {
  const amount = roundMoney(
    refundAmount || purchase.baseCurrencyAmount || 0
  );

  return postJournalEntry({
    entryDate: normalizePostingDate(refundDate || new Date()),
    memo: `Customer purchase refund for ${purchase.customerName}`,
    reference: purchase.purchaseNumber,
    sourceModule: "Customer Purchases",
    createdBy: getUserName(user),
    lines: templates.buildCustomerPurchaseRefundLines({
      paymentAccount,
      amount,
      description: `${purchase.purchaseNumber} refund from ${purchase.merchant}`,
    }),
  });
};

const postCustomerPurchaseRecoveryInvoice = async ({
  customerName,
  invoiceNumber,
  recoverableAmount,
  shoppingServiceFee,
  shippingRevenue,
  deliveryRevenue,
  otherServiceRevenue,
  invoiceDate,
  user,
}) => {
  return postJournalEntry({
    entryDate: normalizePostingDate(
      invoiceDate || new Date()
    ),
    memo: `Customer purchase recovery invoice for ${
      customerName || "customer"
    }`,
    reference: invoiceNumber,
    sourceModule: "Customer Purchases",
    createdBy: getUserName(user),
    lines:
      templates.buildCustomerPurchaseRecoveryInvoiceLines({
        recoverableAmount,
        shoppingServiceFee,
        shippingRevenue,
        deliveryRevenue,
        otherServiceRevenue,
      }),
  });
};

module.exports = {
  postCustomerInvoice,
  receiveInvoicePayment,
  postVendorBill,
  payVendorBill,
  postOwnerDeposit,
  postOwnerDrawing,
  transferFunds,
  postExpensePayment,
  postEmployeeAdvanceFunding,
  postPayrollPayment,
  postTaxLiabilityPayment,
  postGctFilingSettlement,
  postCustomerPurchase,
  refundCustomerPurchase,
  postCustomerPurchaseRecoveryInvoice,
};