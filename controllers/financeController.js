const Invoice = require("../models/Invoice");
const Expense = require("../models/Expense");
const Payroll = require("../models/Payroll");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const { writeAuditLog } = require("../utils/auditLogger");

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
    const { employeeName, role, payPeriod, grossPay, deductions, status } = req.body;

    if (!employeeName || !role || !payPeriod || !grossPay) {
      return res.status(400).json({
        success: false,
        message: "All payroll fields are required",
      });
    }

    const gross = Number(grossPay || 0);
    const deduct = Number(deductions || 0);
    const net = gross - deduct;

    const newPayroll = await Payroll.create({
      payrollNumber: `PAY-${Date.now()}`,
      employeeName,
      role,
      payPeriod,
      grossPay: gross,
      deductions: deduct,
      netPay: net,
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