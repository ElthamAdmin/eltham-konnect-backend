const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");
const Payroll = require("../models/Payroll");
const HREmployee = require("../models/HREmployee");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const ChartOfAccount = require("../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");
const { writeAuditLog } = require("../utils/auditLogger");
const {
  postJournalEntry,
  SYSTEM_ACCOUNTS,
} = require("../utils/generalLedgerPoster");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

// Jamaica payroll constants
const JAMAICA_NIS_EMPLOYEE_RATE = 0.025;
const JAMAICA_NHT_EMPLOYEE_RATE = 0.02;
const JAMAICA_EDUCATION_TAX_RATE = 0.0225;
const JAMAICA_INCOME_TAX_RATE = 0.25;

// Based on the currently phased annual PIT threshold referenced in MoFPS FY 2025/26 interim report.
const JAMAICA_ANNUAL_PIT_THRESHOLD = 2003496;
const JAMAICA_MONTHLY_PIT_THRESHOLD = JAMAICA_ANNUAL_PIT_THRESHOLD / 12;

// NIS wage ceiling has historically been capped; keeping this as a conservative business rule.
const JAMAICA_NIS_ANNUAL_WAGE_CEILING = 5000000;
const JAMAICA_NIS_MONTHLY_WAGE_CEILING = JAMAICA_NIS_ANNUAL_WAGE_CEILING / 12;

const calculateJamaicanPayrollDeductions = ({
  grossPay,
  pensionEmployee = 0,
}) => {
  const gross = roundMoney(grossPay);
  const pension = roundMoney(pensionEmployee);

  const nisBase = Math.min(gross, JAMAICA_NIS_MONTHLY_WAGE_CEILING);
  const nisEmployee = roundMoney(nisBase * JAMAICA_NIS_EMPLOYEE_RATE);
  const nhtEmployee = roundMoney(gross * JAMAICA_NHT_EMPLOYEE_RATE);
  const educationTax = roundMoney(gross * JAMAICA_EDUCATION_TAX_RATE);

  const taxableIncome = Math.max(0, roundMoney(gross - pension));
  const taxableOverThreshold = Math.max(
    0,
    roundMoney(taxableIncome - JAMAICA_MONTHLY_PIT_THRESHOLD)
  );
  const incomeTax = roundMoney(taxableOverThreshold * JAMAICA_INCOME_TAX_RATE);

  const totalDeductions = roundMoney(
    nisEmployee + nhtEmployee + educationTax + incomeTax + pension
  );

  const netPay = roundMoney(gross - totalDeductions);

  return {
    grossPay: gross,
    nisEmployee,
    nhtEmployee,
    educationTax,
    incomeTax,
    pensionEmployee: pension,
    totalDeductions,
    netPay,
  };
};

const normalizeDateValue = (value) => {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
};

const toMonthKey = (value) => {
  const date = normalizeDateValue(value);
  if (!date) return "";
  return date.toISOString().slice(0, 7);
};

const formatMonthLabel = (monthKey) => {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
};

const isDateWithinRange = (value, startDate, endDate) => {
  const date = normalizeDateValue(value);
  if (!date) return false;

  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;

  return true;
};

const buildDateRange = (from, to) => {
  let startDate = null;
  let endDate = null;

  if (from) {
    const parsedFrom = new Date(from);
    if (!Number.isNaN(parsedFrom.getTime())) {
      startDate = parsedFrom;
    }
  }

  if (to) {
    const parsedTo = new Date(to);
    if (!Number.isNaN(parsedTo.getTime())) {
      parsedTo.setHours(23, 59, 59, 999);
      endDate = parsedTo;
    }
  }

  return { startDate, endDate };
};

const getReceiptFileExists = (receiptUrl = "") => {
  if (!receiptUrl) return false;

  const filename = String(receiptUrl).split("/").pop();
  if (!filename) return false;

  const filePath = require("path").join(
    __dirname,
    "..",
    "uploads",
    "expense-receipts",
    filename
  );

  return require("fs").existsSync(filePath);
};

const getExpenses = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;

    const total = await Expense.countDocuments();

    const expenseRecords = await Expense.find()
  .sort({ createdAt: -1, _id: -1 })
  .skip(skip)
  .limit(limit);

const expenses = expenseRecords.map((expense) => ({
  ...expense.toObject(),
  receiptFileExists: getReceiptFileExists(expense.receiptUrl),
}));

    res.json({
      success: true,
      message: "Expenses retrieved successfully",
      totalExpenses: total,
      data: expenses,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("Error getting expenses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve expenses",
      error: error.message,
    });
  }
};

const getExpenseAccountCode = (category = "") => {
  const normalized = String(category).trim().toLowerCase();

  if (normalized.includes("rent")) {
    return SYSTEM_ACCOUNTS.RENT_EXPENSE;
  }

  if (
    normalized.includes("utility") ||
    normalized.includes("light") ||
    normalized.includes("water") ||
    normalized.includes("internet")
  ) {
    return SYSTEM_ACCOUNTS.UTILITIES_EXPENSE;
  }

  if (
    normalized.includes("delivery") ||
    normalized.includes("fuel") ||
    normalized.includes("gas") ||
    normalized.includes("transport") ||
    normalized.includes("courier")
  ) {
    return SYSTEM_ACCOUNTS.DELIVERY_EXPENSE;
  }

  if (
    normalized.includes("supply") ||
    normalized.includes("supplies") ||
    normalized.includes("stationery") ||
    normalized.includes("office")
  ) {
    return SYSTEM_ACCOUNTS.SUPPLIES_EXPENSE;
  }

  if (normalized.includes("payroll")) {
    return SYSTEM_ACCOUNTS.PAYROLL_EXPENSE;
  }

  return SYSTEM_ACCOUNTS.OPERATING_EXPENSE;
};

const createExpense = async (req, res) => {
  try {
    const {
      date,
      category,
      description,
      amount,
      status,
      paidFromAccountNumber,
    } = req.body;

    if (!date || !category || !description || !amount) {
      return res.status(400).json({
        success: false,
        message: "All expense fields are required",
      });
    }

    const numericAmount = Number(amount || 0);

    if (numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Expense amount must be greater than zero",
      });
    }

let paidFromAccountName = "";
let selectedFinancialAccount = null;

    if (paidFromAccountNumber) {
      selectedFinancialAccount = await FinancialAccount.findOne({
  accountNumber: paidFromAccountNumber,
});

      if (!selectedFinancialAccount) {
        return res.status(404).json({
          success: false,
          message: "Selected financial account not found",
        });
      }

      if (Number(selectedFinancialAccount.currentBalance || 0) < numericAmount) {
        return res.status(400).json({
          success: false,
          message: "Insufficient balance in selected account",
        });
      }

paidFromAccountName = selectedFinancialAccount.accountName;

      await AccountTransaction.create({
        transactionNumber: `TRN-${Date.now()}`,
        accountNumber: selectedFinancialAccount.accountNumber,
        accountName: selectedFinancialAccount.accountName,
        transactionType: "Expense Payment",
        amount: numericAmount,
        reference: category,
        notes: description,
        transactionDate: new Date(date),
      });
    }

    try {
  await postJournalEntry({
    entryDate: date,
    memo: `Expense payment: ${description}`,
    reference: category,
    sourceModule: "Expenses",
    createdBy: req.user?.fullName || "System User",
    lines: [
      {
        accountCode: getExpenseAccountCode(category),
        debit: numericAmount,
        credit: 0,
        description: `${category}: ${description}`,
      },
      {
        accountCode:
  selectedFinancialAccount?.linkedChartAccountCode ||
  SYSTEM_ACCOUNTS.CASH_ON_HAND,
        debit: 0,
        credit: numericAmount,
        description: `Expense paid from ${selectedFinancialAccount?.accountName || "Cash on Hand"}`,
      },
    ],
  });
} catch (ledgerError) {
  console.error("Expense journal posting failed:", ledgerError.message);
}

    const receiptUrl = req.file
      ? `/uploads/expense-receipts/${req.file.filename}`
      : "";

    const newExpense = await Expense.create({
      expenseNumber: `EXP-${Date.now()}`,
      date,
      category,
      description,
      amount: numericAmount,
      status: status || "Paid",
      paidFromAccountNumber: paidFromAccountNumber || "",
      paidFromAccountName,
      receiptUrl,
    });

    try {
      if (req.user) {
        await writeAuditLog({
          req,
          action: "CREATE_EXPENSE",
          module: "Finance",
          description: `Expense ${newExpense.expenseNumber} created for ${newExpense.category}`,
          targetType: "Expense",
          targetId: newExpense.expenseNumber,
          metadata: {
            amount: newExpense.amount,
            status: newExpense.status,
            paidFromAccountNumber: newExpense.paidFromAccountNumber,
            paidFromAccountName: newExpense.paidFromAccountName,
            receiptUrl: newExpense.receiptUrl,
          },
        });
      }
    } catch (auditError) {
      console.error("Audit log error while creating expense:", auditError);
    }

    res.status(201).json({
      success: true,
      message: "Expense created successfully",
      data: newExpense,
    });
  } catch (error) {
    console.error("Error creating expense:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create expense",
      error: error.message,
    });
  }
};

const getPayroll = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;

    const total = await Payroll.countDocuments();

    const payroll = await Payroll.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      message: "Payroll records retrieved successfully",
      totalPayroll: total,
      data: payroll,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("Error getting payroll:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve payroll records",
      error: error.message,
    });
  }
};
const getMyPayroll = async (req, res) => {
  try {
    const linkedEmployeeId = req.user?.linkedEmployeeId || "";
    const userId = req.user?.userId || "";

    let employee = null;

    if (linkedEmployeeId) {
      employee = await HREmployee.findOne({ employeeId: linkedEmployeeId });
    }

    if (!employee && userId) {
      employee = await HREmployee.findOne({ linkedUserId: userId });
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "No HR employee profile is linked to this user",
      });
    }

    const payroll = await Payroll.find({ employeeId: employee.employeeId }).sort({
      createdAt: -1,
      _id: -1,
    });

    res.json({
      success: true,
      message: "My payroll records retrieved successfully",
      data: payroll,
    });
  } catch (error) {
    console.error("Error getting my payroll:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve my payroll records",
      error: error.message,
    });
  }
};
const createPayroll = async (req, res) => {
  try {
    const {
      employeeId,
      employeeName,
      role,
      payPeriod,
      grossPay,
      deductions,
      status,
      nisEmployee,
      nhtEmployee,
      educationTax,
      incomeTax,
      pensionEmployee,
      autoCalculateStatutoryDeductions,
      paidFromAccountNumber,
    } = req.body;

    if (!payPeriod || !grossPay) {
      return res.status(400).json({
        success: false,
        message: "Pay period and gross pay are required",
      });
    }

    let finalEmployeeId = "";
    let finalEmployeeName = employeeName || "";
    let finalRole = role || "";
    let finalGrossPay = roundMoney(grossPay);

    if (employeeId) {
      const employee = await HREmployee.findOne({ employeeId });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Selected employee not found",
        });
      }

      finalEmployeeId = employee.employeeId;
      finalEmployeeName = employee.fullName;
      finalRole = employee.jobTitle;
      finalGrossPay = roundMoney(grossPay || employee.payRate || 0);
    }

    if (!finalEmployeeName || !finalRole || !payPeriod || !finalGrossPay) {
      return res.status(400).json({
        success: false,
        message: "Employee name, role, pay period, and gross pay are required",
      });
    }

    if (finalGrossPay <= 0) {
      return res.status(400).json({
        success: false,
        message: "Gross pay must be greater than zero",
      });
    }

    const hasDetailedManualDeductions =
      nisEmployee !== undefined ||
      nhtEmployee !== undefined ||
      educationTax !== undefined ||
      incomeTax !== undefined ||
      pensionEmployee !== undefined;

    let payrollBreakdown;

    if (
      autoCalculateStatutoryDeductions === true ||
      autoCalculateStatutoryDeductions === "true" ||
      (!hasDetailedManualDeductions && !deductions)
    ) {
      payrollBreakdown = calculateJamaicanPayrollDeductions({
        grossPay: finalGrossPay,
        pensionEmployee: Number(pensionEmployee || 0),
      });
    } else if (hasDetailedManualDeductions) {
      const calculatedNisEmployee = roundMoney(nisEmployee);
      const calculatedNhtEmployee = roundMoney(nhtEmployee);
      const calculatedEducationTax = roundMoney(educationTax);
      const calculatedIncomeTax = roundMoney(incomeTax);
      const calculatedPensionEmployee = roundMoney(pensionEmployee);

      const calculatedTotalDeductions = roundMoney(
        calculatedNisEmployee +
          calculatedNhtEmployee +
          calculatedEducationTax +
          calculatedIncomeTax +
          calculatedPensionEmployee
      );

      payrollBreakdown = {
        grossPay: finalGrossPay,
        nisEmployee: calculatedNisEmployee,
        nhtEmployee: calculatedNhtEmployee,
        educationTax: calculatedEducationTax,
        incomeTax: calculatedIncomeTax,
        pensionEmployee: calculatedPensionEmployee,
        totalDeductions: calculatedTotalDeductions,
        netPay: roundMoney(finalGrossPay - calculatedTotalDeductions),
      };
    } else {
      const legacyDeductions = roundMoney(deductions);
      const safeLegacyDeductions = legacyDeductions > 0 ? legacyDeductions : 0;

      payrollBreakdown = {
        grossPay: finalGrossPay,
        nisEmployee: 0,
        nhtEmployee: 0,
        educationTax: 0,
        incomeTax: 0,
        pensionEmployee: 0,
        totalDeductions: safeLegacyDeductions,
        netPay: roundMoney(finalGrossPay - safeLegacyDeductions),
      };
    }

    let paidFromAccountName = "";
let selectedFinancialAccount = null;

if (paidFromAccountNumber) {
  selectedFinancialAccount = await FinancialAccount.findOne({
    accountNumber: paidFromAccountNumber,
  });

  if (!selectedFinancialAccount) {
    return res.status(404).json({
      success: false,
      message: "Selected payroll payment account not found",
    });
  }

  if (
    Number(selectedFinancialAccount.currentBalance || 0) <
    Number(payrollBreakdown.netPay || 0)
  ) {
    return res.status(400).json({
      success: false,
      message: "Insufficient balance in selected payroll payment account",
    });
  }

  paidFromAccountName = selectedFinancialAccount.accountName;

  await AccountTransaction.create({
    transactionNumber: `TRN-${Date.now()}`,
    accountNumber: selectedFinancialAccount.accountNumber,
    accountName: selectedFinancialAccount.accountName,
    transactionType: "Withdrawal",
    amount: Number(payrollBreakdown.netPay || 0),
    reference: `Payroll ${payPeriod}`,
    notes: `Payroll payment for ${finalEmployeeName}`,
    transactionDate: new Date(),
  });
}

    try {
  await postJournalEntry({
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `Payroll payment for ${finalEmployeeName}`,
    reference: `Payroll ${payPeriod}`,
    sourceModule: "Payroll",
    createdBy: req.user?.fullName || "System User",
    lines: [
  {
    accountCode: SYSTEM_ACCOUNTS.PAYROLL_EXPENSE,
    debit: Number(payrollBreakdown.grossPay || 0),
    credit: 0,
    description: `Gross payroll expense for ${finalEmployeeName}`,
  },

  {
    accountCode: SYSTEM_ACCOUNTS.NIS_PAYABLE,
    debit: 0,
    credit: Number(payrollBreakdown.nisEmployee || 0),
    description: `NIS payable for ${finalEmployeeName}`,
  },

  {
    accountCode: SYSTEM_ACCOUNTS.NHT_PAYABLE,
    debit: 0,
    credit: Number(payrollBreakdown.nhtEmployee || 0),
    description: `NHT payable for ${finalEmployeeName}`,
  },

  {
    accountCode: SYSTEM_ACCOUNTS.EDUCATION_TAX_PAYABLE,
    debit: 0,
    credit: Number(payrollBreakdown.educationTax || 0),
    description: `Education tax payable for ${finalEmployeeName}`,
  },

  {
    accountCode: SYSTEM_ACCOUNTS.PAYE_PAYABLE,
    debit: 0,
    credit: Number(payrollBreakdown.incomeTax || 0),
    description: `PAYE payable for ${finalEmployeeName}`,
  },

  {
    accountCode: SYSTEM_ACCOUNTS.PENSION_PAYABLE,
    debit: 0,
    credit: Number(payrollBreakdown.pensionEmployee || 0),
    description: `Pension payable for ${finalEmployeeName}`,
  },

  {
    accountCode:
      selectedFinancialAccount?.linkedChartAccountCode ||
      SYSTEM_ACCOUNTS.CASH_ON_HAND,
    debit: 0,
    credit: Number(payrollBreakdown.netPay || 0),
    description: `Payroll paid from ${
      selectedFinancialAccount?.accountName || "Cash on Hand"
    }`,
  },
],
  });
} catch (ledgerError) {
  console.error("Payroll journal posting failed:", ledgerError.message);
}

    const newPayroll = await Payroll.create({
      payrollNumber: `PAY-${Date.now()}`,
      employeeId: employeeId || "",
      employeeName: finalEmployeeName,
      role: finalRole,
      payPeriod,
      grossPay: payrollBreakdown.grossPay,
      deductions: payrollBreakdown.totalDeductions,
      nisEmployee: payrollBreakdown.nisEmployee,
      nhtEmployee: payrollBreakdown.nhtEmployee,
      educationTax: payrollBreakdown.educationTax,
      incomeTax: payrollBreakdown.incomeTax,
      pensionEmployee: payrollBreakdown.pensionEmployee,
      totalDeductions: payrollBreakdown.totalDeductions,
      netPay: payrollBreakdown.netPay,
      paidFromAccountNumber: paidFromAccountNumber || "",
      paidFromAccountName,
      status: status || "Pending",
    });

    try {
      if (req.user) {
        await writeAuditLog({
          req,
          action: "CREATE_PAYROLL",
          module: "Finance",
          description: `Payroll ${newPayroll.payrollNumber} created for ${newPayroll.employeeName}`,
          targetType: "Payroll",
          targetId: newPayroll.payrollNumber,
          metadata: {
            employeeId: newPayroll.employeeId,
            employeeName: newPayroll.employeeName,
            role: newPayroll.role,
            payPeriod: newPayroll.payPeriod,
            grossPay: newPayroll.grossPay,
            deductions: newPayroll.deductions,
            nisEmployee: newPayroll.nisEmployee,
            nhtEmployee: newPayroll.nhtEmployee,
            educationTax: newPayroll.educationTax,
            incomeTax: newPayroll.incomeTax,
            pensionEmployee: newPayroll.pensionEmployee,
            totalDeductions: newPayroll.totalDeductions,
            netPay: newPayroll.netPay,
            paidFromAccountNumber: newPayroll.paidFromAccountNumber,
            paidFromAccountName: newPayroll.paidFromAccountName,
            status: newPayroll.status,
          },
        });
      }
    } catch (auditError) {
      console.error("Audit log error while creating payroll:", auditError);
    }

    res.status(201).json({
      success: true,
      message: "Payroll record created successfully",
      data: newPayroll,
    });
  } catch (error) {
    console.error("Error creating payroll:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payroll record",
      error: error.message,
    });
  }
};

const getFinanceSummary = async (req, res) => {
  try {
    const { filter = "today", from = "", to = "", branch = "" } = req.query;

    const getJamaicaYMD = (date = new Date()) => {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Jamaica",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    };

    const makeJamaicaUtcStart = (ymd) => new Date(`${ymd}T05:00:00.000Z`);

    const addDays = (date, days) => {
      const copy = new Date(date);
      copy.setUTCDate(copy.getUTCDate() + days);
      return copy;
    };

    const jamaicaTodayYMD = getJamaicaYMD();

    let startDate = makeJamaicaUtcStart(jamaicaTodayYMD);
    let endDate = addDays(startDate, 1);
    endDate = new Date(endDate.getTime() - 1);

    if (filter === "thisWeek") {
      const day = new Date(`${jamaicaTodayYMD}T00:00:00`).getDay();
      const diff = day === 0 ? 6 : day - 1;
      startDate = addDays(startDate, -diff);
      endDate = addDays(startDate, 7);
      endDate = new Date(endDate.getTime() - 1);
    }

    if (filter === "thisMonth") {
      const [year, month] = jamaicaTodayYMD.split("-");
      startDate = makeJamaicaUtcStart(`${year}-${month}-01`);

      const nextMonthStart = new Date(startDate);
      nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);

      endDate = new Date(nextMonthStart.getTime() - 1);
    }

    if (filter === "thisYear") {
      const [year] = jamaicaTodayYMD.split("-");
      startDate = makeJamaicaUtcStart(`${year}-01-01`);
      endDate = makeJamaicaUtcStart(`${Number(year) + 1}-01-01`);
      endDate = new Date(endDate.getTime() - 1);
    }

    if (filter === "allTime") {
      startDate = null;
      endDate = null;
    }

    if (filter === "custom" && from && to) {
      startDate = makeJamaicaUtcStart(from);
      endDate = makeJamaicaUtcStart(to);
      endDate = addDays(endDate, 1);
      endDate = new Date(endDate.getTime() - 1);
    }

    const isWithinSummaryRange = (value) => {
      if (!startDate || !endDate) return true;
      if (!value) return false;

      let date = null;

      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        date = makeJamaicaUtcStart(value);
      } else {
        date = normalizeDateValue(value);
      }

      if (!date) return false;

      return date >= startDate && date <= endDate;
    };

    const ledgerTransactions = await GeneralLedgerTransaction.find();
    const chartAccounts = await ChartOfAccount.find({ status: "Active" });
    const invoices = await Invoice.find();

    const filteredLedger = ledgerTransactions.filter((item) =>
      isWithinSummaryRange(item.entryDate || item.createdAt)
    );

    const totalRevenue = roundMoney(
      filteredLedger
        .filter((item) => item.accountCategory === "Revenue")
        .reduce(
          (sum, item) =>
            sum + Number(item.credit || 0) - Number(item.debit || 0),
          0
        )
    );

    const totalExpenses = roundMoney(
      filteredLedger
        .filter(
          (item) =>
            item.accountCategory === "Expense" ||
            item.accountCategory === "Cost of Sales"
        )
        .reduce(
          (sum, item) =>
            sum + Number(item.debit || 0) - Number(item.credit || 0),
          0
        )
    );

    const totalPayroll = roundMoney(
      filteredLedger
        .filter(
          (item) =>
            String(item.accountName || "").toLowerCase().includes("payroll") ||
            String(item.sourceModule || "").toLowerCase().includes("payroll")
        )
        .reduce(
          (sum, item) =>
            sum + Number(item.debit || 0) - Number(item.credit || 0),
          0
        )
    );

    const branchMatches = (record) => {
      if (!branch) return true;
      return String(record.branch || record.customerBranch || "").trim() === branch;
    };

    const unpaidInvoices = invoices.filter((inv) => {
      const statusIsUnpaid =
        String(inv.status || "").trim().toLowerCase() === "unpaid";
      return statusIsUnpaid && branchMatches(inv);
    });

    const paidInvoices = invoices.filter((inv) => {
      const statusIsPaid =
        String(inv.status || "").trim().toLowerCase() === "paid";
      const dateValue = inv.paidAt || inv.paidDate || inv.createdAt;
      return statusIsPaid && isWithinSummaryRange(dateValue) && branchMatches(inv);
    });

    const outstandingRevenue = roundMoney(
      unpaidInvoices.reduce((sum, inv) => sum + Number(inv.finalTotal || 0), 0)
    );

    const cashOnHand = roundMoney(
      chartAccounts
        .filter(
          (account) =>
            account.accountCategory === "Asset" &&
            (
              String(account.accountName || "").toLowerCase().includes("cash") ||
              String(account.accountName || "").toLowerCase().includes("bank")
            )
        )
        .reduce((sum, account) => sum + Number(account.currentBalance || 0), 0)
    );

    const netPosition = roundMoney(totalRevenue - totalExpenses);

    res.json({
      success: true,
      data: {
        filters: {
          filter,
          from,
          to,
          branch,
          startDate,
          endDate,
        },
        totalRevenue,
        outstandingRevenue,
        totalExpenses,
        totalPayroll,
        paidInvoices: paidInvoices.length,
        unpaidInvoices: unpaidInvoices.length,
        cashOnHand,
        netPosition,
      },
    });
  } catch (error) {
    console.error("Error getting finance summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve finance summary",
      error: error.message,
    });
  }
};

const getFinancialReports = async (req, res) => {
  try {
    const { from = "", to = "" } = req.query;
    const { startDate, endDate } = buildDateRange(from, to);

    const ledgerTransactions = await GeneralLedgerTransaction.find().sort({
      entryDate: 1,
      createdAt: 1,
    });

    const chartAccounts = await ChartOfAccount.find({ status: "Active" });

    const filteredLedger = ledgerTransactions.filter((item) =>
      isDateWithinRange(item.entryDate || item.createdAt, startDate, endDate)
    );

    const calculateLedgerCategoryTotal = (category, normalSide = "Credit") => {
      return roundMoney(
        filteredLedger
          .filter((item) => item.accountCategory === category)
          .reduce((sum, item) => {
            const debit = Number(item.debit || 0);
            const credit = Number(item.credit || 0);

            if (normalSide === "Debit") {
              return sum + debit - credit;
            }

            return sum + credit - debit;
          }, 0)
      );
    };

    const revenue = calculateLedgerCategoryTotal("Revenue", "Credit");
    const costOfSales = calculateLedgerCategoryTotal("Cost of Sales", "Debit");
    const operatingExpenses = calculateLedgerCategoryTotal("Expense", "Debit");

    const payrollExpense = roundMoney(
      filteredLedger
        .filter(
          (item) =>
            item.accountCategory === "Expense" &&
            String(item.accountName || "").toLowerCase().includes("payroll")
        )
        .reduce(
          (sum, item) =>
            sum + Number(item.debit || 0) - Number(item.credit || 0),
          0
        )
    );

    const totalExpenses = roundMoney(costOfSales + operatingExpenses);
    const grossProfit = roundMoney(revenue - costOfSales);
    const netProfit = roundMoney(revenue - totalExpenses);

    const getChartBalanceByCategory = (category, normalSide = "Debit") => {
      return roundMoney(
        chartAccounts
          .filter((account) => account.accountCategory === category)
          .reduce((sum, account) => {
            return sum + Number(account.currentBalance || 0);
          }, 0)
      );
    };

    const totalAssets = getChartBalanceByCategory("Asset", "Debit");
    const totalLiabilities = getChartBalanceByCategory("Liability", "Credit");
    const totalEquity = getChartBalanceByCategory("Equity", "Credit");

    const cashOnHand = roundMoney(
      chartAccounts
        .filter(
          (account) =>
            account.accountCategory === "Asset" &&
            (
              String(account.accountName || "").toLowerCase().includes("cash") ||
              String(account.accountName || "").toLowerCase().includes("bank") ||
              String(account.accountType || "").toLowerCase().includes("bank")
            )
        )
        .reduce((sum, account) => sum + Number(account.currentBalance || 0), 0)
    );

    const accountsReceivable = roundMoney(
      chartAccounts
        .filter((account) => account.accountCode === "1100")
        .reduce((sum, account) => sum + Number(account.currentBalance || 0), 0)
    );

    const accountsPayable = roundMoney(
      chartAccounts
        .filter((account) => account.accountCode === "2000")
        .reduce((sum, account) => sum + Number(account.currentBalance || 0), 0)
    );

    const expenseByCategoryMap = {};

    filteredLedger
      .filter(
        (item) =>
          item.accountCategory === "Expense" ||
          item.accountCategory === "Cost of Sales"
      )
      .forEach((item) => {
        const category = item.accountName || "Uncategorized";
        expenseByCategoryMap[category] = roundMoney(
          Number(expenseByCategoryMap[category] || 0) +
            Number(item.debit || 0) -
            Number(item.credit || 0)
        );
      });

    const expenseByCategory = Object.entries(expenseByCategoryMap)
      .map(([category, amount]) => ({
        category,
        amount: roundMoney(amount),
      }))
      .sort((a, b) => b.amount - a.amount);

    const monthMap = {};

    const ensureMonth = (monthKey) => {
      if (!monthMap[monthKey]) {
        monthMap[monthKey] = {
          month: monthKey,
          label: formatMonthLabel(monthKey),
          revenue: 0,
          expenses: 0,
          payroll: 0,
          net: 0,
        };
      }
    };

    filteredLedger.forEach((item) => {
      const monthKey = toMonthKey(item.entryDate || item.createdAt);
      if (!monthKey) return;

      ensureMonth(monthKey);

      const debit = Number(item.debit || 0);
      const credit = Number(item.credit || 0);

      if (item.accountCategory === "Revenue") {
        monthMap[monthKey].revenue = roundMoney(
          monthMap[monthKey].revenue + credit - debit
        );
      }

      if (
        item.accountCategory === "Expense" ||
        item.accountCategory === "Cost of Sales"
      ) {
        const expenseAmount = debit - credit;

        monthMap[monthKey].expenses = roundMoney(
          monthMap[monthKey].expenses + expenseAmount
        );

        if (String(item.accountName || "").toLowerCase().includes("payroll")) {
          monthMap[monthKey].payroll = roundMoney(
            monthMap[monthKey].payroll + expenseAmount
          );
        }
      }
    });

    const monthlyTrend = Object.values(monthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((item) => ({
        ...item,
        net: roundMoney(
          Number(item.revenue || 0) - Number(item.expenses || 0)
        ),
      }));

    const payroll = await Payroll.find();

    const filteredPayroll = payroll.filter((item) =>
      isDateWithinRange(item.payPeriod || item.createdAt, startDate, endDate)
    );

    const statutoryTotals = {
      nisEmployee: roundMoney(
        filteredPayroll.reduce((sum, item) => sum + Number(item.nisEmployee || 0), 0)
      ),
      nhtEmployee: roundMoney(
        filteredPayroll.reduce((sum, item) => sum + Number(item.nhtEmployee || 0), 0)
      ),
      educationTax: roundMoney(
        filteredPayroll.reduce((sum, item) => sum + Number(item.educationTax || 0), 0)
      ),
      incomeTax: roundMoney(
        filteredPayroll.reduce((sum, item) => sum + Number(item.incomeTax || 0), 0)
      ),
      pensionEmployee: roundMoney(
        filteredPayroll.reduce((sum, item) => sum + Number(item.pensionEmployee || 0), 0)
      ),
      totalDeductions: roundMoney(
        filteredPayroll.reduce(
          (sum, item) =>
            sum +
            Number(
              item.totalDeductions !== undefined
                ? item.totalDeductions
                : item.deductions || 0
            ),
          0
        )
      ),
    };

    const profitAndLoss = {
      revenue,
      costOfSales,
      grossProfit,
      operatingExpenses,
      payrollExpense,
      totalExpenses,
      netProfit,
    };

    const cashFlow = {
      cashInflowFromRevenue: roundMoney(
        filteredLedger
          .filter(
            (item) =>
              item.accountCategory === "Asset" &&
              Number(item.debit || 0) > 0
          )
          .reduce((sum, item) => sum + Number(item.debit || 0), 0)
      ),
      cashOutflowForExpenses: roundMoney(
        filteredLedger
          .filter(
            (item) =>
              item.accountCategory === "Asset" &&
              Number(item.credit || 0) > 0
          )
          .reduce((sum, item) => sum + Number(item.credit || 0), 0)
      ),
    };

    cashFlow.netCashFlow = roundMoney(
      cashFlow.cashInflowFromRevenue - cashFlow.cashOutflowForExpenses
    );

    const balanceSheet = {
      assets: {
        cashOnHand,
        accountsReceivable,
        totalAssets,
      },
      liabilities: {
        accountsPayable,
        totalLiabilities,
      },
      equity: {
        totalEquity,
        accountingEquationEquity: roundMoney(totalAssets - totalLiabilities),
      },
      check: {
        assetsMinusLiabilitiesAndEquity: roundMoney(
          totalAssets - totalLiabilities - totalEquity
        ),
      },
    };

    res.json({
      success: true,
      data: {
        filters: {
          from,
          to,
        },
        reportMeta: {
          generatedAt: new Date().toISOString(),
          reportTitle: "Ledger-Based Financial Reports",
          sourceOfTruth: "GeneralLedgerTransaction + ChartOfAccount",
        },
        profitAndLoss,
        cashFlow,
        balanceSheet,
        statutoryTotals,
        expenseByCategory,
        monthlyTrend,
      },
    });
  } catch (error) {
    console.error("Error getting financial reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve financial reports",
      error: error.message,
    });
  }
};

const getMonthlyIncomeVsExpenses = async (req, res) => {
  try {
    const ledgerTransactions = await GeneralLedgerTransaction.find().sort({
      entryDate: 1,
      createdAt: 1,
    });

    const monthMap = {};

    const ensureMonth = (monthKey) => {
      if (!monthMap[monthKey]) {
        monthMap[monthKey] = {
          month: monthKey,
          income: 0,
          expenses: 0,
        };
      }
    };

    ledgerTransactions.forEach((item) => {
      const monthKey = toMonthKey(item.entryDate || item.createdAt);
      if (!monthKey) return;

      ensureMonth(monthKey);

      if (item.accountCategory === "Revenue") {
        monthMap[monthKey].income = roundMoney(
          monthMap[monthKey].income +
            Number(item.credit || 0) -
            Number(item.debit || 0)
        );
      }

      if (
        item.accountCategory === "Expense" ||
        item.accountCategory === "Cost of Sales"
      ) {
        monthMap[monthKey].expenses = roundMoney(
          monthMap[monthKey].expenses +
            Number(item.debit || 0) -
            Number(item.credit || 0)
        );
      }
    });

    const monthlyData = Object.values(monthMap).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    res.json({
      success: true,
      data: monthlyData,
    });
  } catch (error) {
    console.error("Error getting monthly income vs expenses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve monthly chart data",
      error: error.message,
    });
  }
};

module.exports = {
  getExpenses,
  createExpense,
  getPayroll,
  getMyPayroll,
  createPayroll,
  getFinanceSummary,
  getFinancialReports,
  getMonthlyIncomeVsExpenses,
};