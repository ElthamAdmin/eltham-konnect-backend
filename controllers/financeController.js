const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");
const Payroll = require("../models/Payroll");
const HREmployee = require("../models/HREmployee");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const { writeAuditLog } = require("../utils/auditLogger");

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

const getExpenses = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;

    const total = await Expense.countDocuments();

    const expenses = await Expense.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit);

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

    if (paidFromAccountNumber) {
      const account = await FinancialAccount.findOne({
        accountNumber: paidFromAccountNumber,
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Selected financial account not found",
        });
      }

      if (Number(account.currentBalance || 0) < numericAmount) {
        return res.status(400).json({
          success: false,
          message: "Insufficient balance in selected account",
        });
      }

      account.currentBalance = Number(account.currentBalance || 0) - numericAmount;
      await account.save();

      paidFromAccountName = account.accountName;

      await AccountTransaction.create({
        transactionNumber: `TRN-${Date.now()}`,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        transactionType: "Expense Payment",
        amount: numericAmount,
        reference: category,
        notes: description,
        transactionDate: new Date(date),
      });
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

    if (paidFromAccountNumber) {
      const account = await FinancialAccount.findOne({
        accountNumber: paidFromAccountNumber,
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Selected payroll payment account not found",
        });
      }

      if (Number(account.currentBalance || 0) < Number(payrollBreakdown.netPay || 0)) {
        return res.status(400).json({
          success: false,
          message: "Insufficient balance in selected payroll payment account",
        });
      }

      account.currentBalance =
        Number(account.currentBalance || 0) - Number(payrollBreakdown.netPay || 0);
      await account.save();

      paidFromAccountName = account.accountName;

      await AccountTransaction.create({
        transactionNumber: `TRN-${Date.now()}`,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        transactionType: "Withdrawal",
        amount: Number(payrollBreakdown.netPay || 0),
        reference: `Payroll ${payPeriod}`,
        notes: `Payroll payment for ${finalEmployeeName}`,
        transactionDate: new Date(),
      });
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
    const invoices = await Invoice.find();
    const expenses = await Expense.find();
    const payroll = await Payroll.find();

    const paidInvoices = invoices.filter(
      (inv) => String(inv.status || "").trim().toLowerCase() === "paid"
    );
    const unpaidInvoices = invoices.filter(
      (inv) => String(inv.status || "").trim().toLowerCase() === "unpaid"
    );

    const totalRevenue = paidInvoices.reduce(
      (sum, inv) => sum + Number(inv.finalTotal || 0),
      0
    );

    const outstandingRevenue = unpaidInvoices.reduce(
      (sum, inv) => sum + Number(inv.finalTotal || 0),
      0
    );

    const totalExpenses = expenses.reduce(
      (sum, exp) => sum + Number(exp.amount || 0),
      0
    );

    const totalPayroll = payroll.reduce(
      (sum, item) => sum + Number(item.netPay || 0),
      0
    );

    const netPosition = totalRevenue - totalExpenses - totalPayroll;

    res.json({
      success: true,
      data: {
        totalRevenue,
        outstandingRevenue,
        totalExpenses,
        totalPayroll,
        paidInvoices: paidInvoices.length,
        unpaidInvoices: unpaidInvoices.length,
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

    const invoices = await Invoice.find();
    const expenses = await Expense.find();
    const payroll = await Payroll.find();
    const accounts = await FinancialAccount.find();

    const filteredPaidInvoices = invoices.filter((inv) => {
      const statusIsPaid = String(inv.status || "").trim().toLowerCase() === "paid";
      const dateValue = inv.paidAt || inv.paidDate || inv.createdAt;
      return statusIsPaid && isDateWithinRange(dateValue, startDate, endDate);
    });

    const filteredUnpaidInvoices = invoices.filter((inv) => {
      const statusIsUnpaid =
        String(inv.status || "").trim().toLowerCase() === "unpaid";
      const dateValue = inv.createdAt;
      return statusIsUnpaid && isDateWithinRange(dateValue, startDate, endDate);
    });

    const filteredExpenses = expenses.filter((exp) =>
      isDateWithinRange(exp.date || exp.createdAt, startDate, endDate)
    );

    const filteredPayroll = payroll.filter((item) =>
      isDateWithinRange(item.payPeriod || item.createdAt, startDate, endDate)
    );

    const revenue = roundMoney(
      filteredPaidInvoices.reduce(
        (sum, inv) => sum + Number(inv.finalTotal || 0),
        0
      )
    );

    const accountsReceivable = roundMoney(
      filteredUnpaidInvoices.reduce(
        (sum, inv) => sum + Number(inv.finalTotal || 0),
        0
      )
    );

    const operatingExpenses = roundMoney(
      filteredExpenses.reduce(
        (sum, exp) => sum + Number(exp.amount || 0),
        0
      )
    );

    const payrollExpense = roundMoney(
      filteredPayroll.reduce(
        (sum, item) => sum + Number(item.netPay || 0),
        0
      )
    );

    const totalExpenses = roundMoney(operatingExpenses + payrollExpense);
    const netProfit = roundMoney(revenue - totalExpenses);

    const cashOnHand = roundMoney(
      accounts.reduce((sum, account) => sum + Number(account.currentBalance || 0), 0)
    );

    const invoiceStats = {
      paidCount: filteredPaidInvoices.length,
      unpaidCount: filteredUnpaidInvoices.length,
      totalCount: filteredPaidInvoices.length + filteredUnpaidInvoices.length,
    };

    const expenseByCategoryMap = {};
    filteredExpenses.forEach((exp) => {
      const category = exp.category || "Uncategorized";
      expenseByCategoryMap[category] =
        roundMoney(
          Number(expenseByCategoryMap[category] || 0) + Number(exp.amount || 0)
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

    filteredPaidInvoices.forEach((inv) => {
      const monthKey = toMonthKey(inv.paidAt || inv.paidDate || inv.createdAt);
      if (!monthKey) return;
      ensureMonth(monthKey);
      monthMap[monthKey].revenue = roundMoney(
        Number(monthMap[monthKey].revenue || 0) + Number(inv.finalTotal || 0)
      );
    });

    filteredExpenses.forEach((exp) => {
      const monthKey = toMonthKey(exp.date || exp.createdAt);
      if (!monthKey) return;
      ensureMonth(monthKey);
      monthMap[monthKey].expenses = roundMoney(
        Number(monthMap[monthKey].expenses || 0) + Number(exp.amount || 0)
      );
    });

    filteredPayroll.forEach((item) => {
      const monthKey = toMonthKey(item.payPeriod || item.createdAt);
      if (!monthKey) return;
      ensureMonth(monthKey);
      monthMap[monthKey].payroll = roundMoney(
        Number(monthMap[monthKey].payroll || 0) + Number(item.netPay || 0)
      );
    });

    const monthlyTrend = Object.values(monthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((item) => ({
        ...item,
        net: roundMoney(
          Number(item.revenue || 0) -
            Number(item.expenses || 0) -
            Number(item.payroll || 0)
        ),
      }));
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

const statutoryByEmployeeMap = {};

filteredPayroll.forEach((item) => {
  const employeeKey =
    `${item.employeeId || "NO-ID"}__${item.employeeName || "Unknown Employee"}`;

  if (!statutoryByEmployeeMap[employeeKey]) {
    statutoryByEmployeeMap[employeeKey] = {
      employeeId: item.employeeId || "-",
      employeeName: item.employeeName || "-",
      role: item.role || "-",
      nisEmployee: 0,
      nhtEmployee: 0,
      educationTax: 0,
      incomeTax: 0,
      pensionEmployee: 0,
      totalDeductions: 0,
      netPay: 0,
      grossPay: 0,
    };
  }

  statutoryByEmployeeMap[employeeKey].nisEmployee = roundMoney(
    statutoryByEmployeeMap[employeeKey].nisEmployee + Number(item.nisEmployee || 0)
  );
  statutoryByEmployeeMap[employeeKey].nhtEmployee = roundMoney(
    statutoryByEmployeeMap[employeeKey].nhtEmployee + Number(item.nhtEmployee || 0)
  );
  statutoryByEmployeeMap[employeeKey].educationTax = roundMoney(
    statutoryByEmployeeMap[employeeKey].educationTax + Number(item.educationTax || 0)
  );
  statutoryByEmployeeMap[employeeKey].incomeTax = roundMoney(
    statutoryByEmployeeMap[employeeKey].incomeTax + Number(item.incomeTax || 0)
  );
  statutoryByEmployeeMap[employeeKey].pensionEmployee = roundMoney(
    statutoryByEmployeeMap[employeeKey].pensionEmployee + Number(item.pensionEmployee || 0)
  );
  statutoryByEmployeeMap[employeeKey].grossPay = roundMoney(
    statutoryByEmployeeMap[employeeKey].grossPay + Number(item.grossPay || 0)
  );
  statutoryByEmployeeMap[employeeKey].netPay = roundMoney(
    statutoryByEmployeeMap[employeeKey].netPay + Number(item.netPay || 0)
  );
  statutoryByEmployeeMap[employeeKey].totalDeductions = roundMoney(
    statutoryByEmployeeMap[employeeKey].totalDeductions +
      Number(
        item.totalDeductions !== undefined
          ? item.totalDeductions
          : item.deductions || 0
      )
  );
});

const statutoryByEmployee = Object.values(statutoryByEmployeeMap).sort((a, b) =>
  String(a.employeeName || "").localeCompare(String(b.employeeName || ""))
);
    const profitAndLoss = {
      revenue,
      operatingExpenses,
      payrollExpense,
      totalExpenses,
      netProfit,
    };

    const cashFlow = {
      collectedRevenue: revenue,
      operatingExpensePayments: operatingExpenses,
      payrollPayments: payrollExpense,
      totalCashOutflows: totalExpenses,
      netCashFlow: roundMoney(revenue - totalExpenses),
    };

    const balanceSheet = {
      assets: {
        cashOnHand,
        accountsReceivable,
        totalAssets: roundMoney(cashOnHand + accountsReceivable),
      },
      liabilities: {
        totalLiabilities: 0,
      },
      equity: {
        ownerEquity: roundMoney(cashOnHand + accountsReceivable),
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
      reportTitle: "Financial Reports",
    },
    invoiceStats,
    profitAndLoss,
    cashFlow,
    balanceSheet,
    statutoryTotals,
    statutoryByEmployee,
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
    const invoices = await Invoice.find();
    const expenses = await Expense.find();
    const payroll = await Payroll.find();

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

    invoices
      .filter((inv) => String(inv.status || "").trim().toLowerCase() === "paid")
      .forEach((inv) => {
        const date = inv.paidDate || inv.paidAt || inv.createdAt;
        const monthKey = String(date).slice(0, 7);
        ensureMonth(monthKey);
        monthMap[monthKey].income += Number(inv.finalTotal || 0);
      });

    expenses.forEach((exp) => {
      const monthKey = String(exp.date).slice(0, 7);
      ensureMonth(monthKey);
      monthMap[monthKey].expenses += Number(exp.amount || 0);
    });

    payroll.forEach((item) => {
      const monthKey = String(item.payPeriod).slice(0, 7);
      ensureMonth(monthKey);
      monthMap[monthKey].expenses += Number(item.netPay || 0);
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