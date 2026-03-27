const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");
const Payroll = require("../models/Payroll");
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
// If you want this made editable in settings later, we can do that safely.
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

  // Taxable income is gross less approved employee pension deduction, if any.
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

const createPayroll = async (req, res) => {
  try {
    const {
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
    } = req.body;

    if (!employeeName || !role || !payPeriod || !grossPay) {
      return res.status(400).json({
        success: false,
        message: "All payroll fields are required",
      });
    }

    const gross = roundMoney(grossPay);

    if (gross <= 0) {
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
        grossPay: gross,
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
        grossPay: gross,
        nisEmployee: calculatedNisEmployee,
        nhtEmployee: calculatedNhtEmployee,
        educationTax: calculatedEducationTax,
        incomeTax: calculatedIncomeTax,
        pensionEmployee: calculatedPensionEmployee,
        totalDeductions: calculatedTotalDeductions,
        netPay: roundMoney(gross - calculatedTotalDeductions),
      };
    } else {
      const legacyDeductions = roundMoney(deductions);
      const safeLegacyDeductions = legacyDeductions > 0 ? legacyDeductions : 0;

      payrollBreakdown = {
        grossPay: gross,
        nisEmployee: 0,
        nhtEmployee: 0,
        educationTax: 0,
        incomeTax: 0,
        pensionEmployee: 0,
        totalDeductions: safeLegacyDeductions,
        netPay: roundMoney(gross - safeLegacyDeductions),
      };
    }

    const newPayroll = await Payroll.create({
      payrollNumber: `PAY-${Date.now()}`,
      employeeName,
      role,
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
    const invoices = await Invoice.find();
    const expenses = await Expense.find();
    const payroll = await Payroll.find();

    const paidInvoices = invoices.filter(
      (inv) => String(inv.status || "").trim().toLowerCase() === "paid"
    );
    const unpaidInvoices = invoices.filter(
      (inv) => String(inv.status || "").trim().toLowerCase() === "unpaid"
    );

    const revenue = paidInvoices.reduce(
      (sum, inv) => sum + Number(inv.finalTotal || 0),
      0
    );

    const accountsReceivable = unpaidInvoices.reduce(
      (sum, inv) => sum + Number(inv.finalTotal || 0),
      0
    );

    const operatingExpenses = expenses.reduce(
      (sum, exp) => sum + Number(exp.amount || 0),
      0
    );

    const payrollExpense = payroll.reduce(
      (sum, item) => sum + Number(item.netPay || 0),
      0
    );

    const totalExpenses = operatingExpenses + payrollExpense;
    const netProfit = revenue - totalExpenses;

    const profitAndLoss = {
      revenue,
      operatingExpenses,
      payrollExpense,
      totalExpenses,
      netProfit,
    };

    const cashFlow = {
      cashInflows: revenue,
      cashOutflows: totalExpenses,
      netCashFlow: revenue - totalExpenses,
    };

    const balanceSheet = {
      assets: {
        cash: revenue - totalExpenses,
        accountsReceivable,
        totalAssets: revenue - totalExpenses + accountsReceivable,
      },
      liabilities: {
        outstandingRevenue: accountsReceivable,
        totalLiabilities: accountsReceivable,
      },
      equity: {
        ownerEquity: netProfit,
      },
    };

    res.json({
      success: true,
      data: {
        profitAndLoss,
        cashFlow,
        balanceSheet,
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
  createPayroll,
  getFinanceSummary,
  getFinancialReports,
  getMonthlyIncomeVsExpenses,
};