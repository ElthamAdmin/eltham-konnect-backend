const Budget = require("../models/Budget");
const Expense = require("../models/Expense");
const Invoice = require("../models/Invoice");
const Payroll = require("../models/Payroll");
const ChartOfAccount = require("../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getMonthRange = (year, month) => {
  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);

  return { start, end };
};

const isWithinMonth = (value, year, month) => {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const { start, end } = getMonthRange(year, month);
  return date >= start && date <= end;
};

const calculateActualAmount = async ({
  category,
  budgetYear,
  budgetMonth,
  linkedChartAccountCode = "",
  branch = "All Branches",
}) => {
  const { start, end } = getMonthRange(budgetYear, budgetMonth);

    if (linkedChartAccountCode) {
    const ledgerRows = await GeneralLedgerTransaction.find({
      accountCode: linkedChartAccountCode,
    });

    return ledgerRows
      .filter((row) =>
        isWithinMonth(row.entryDate || row.createdAt, budgetYear, budgetMonth)
      )
      .reduce((sum, row) => {
        const debit = Number(row.debit || 0);
        const credit = Number(row.credit || 0);

        if (row.accountCategory === "Revenue") {
          return sum + credit - debit;
        }

        return sum + debit - credit;
      }, 0);
  }

  if (category === "Revenue") {
    const invoices = await Invoice.find({ status: "Paid" });

    return invoices
      .filter((invoice) =>
        isWithinMonth(
          invoice.paidAt || invoice.paidDate || invoice.createdAt,
          budgetYear,
          budgetMonth
        )
      )
      .reduce((sum, invoice) => sum + Number(invoice.finalTotal || 0), 0);
  }

  if (category === "Payroll") {
    const payrolls = await Payroll.find();

    return payrolls
      .filter((payroll) =>
        isWithinMonth(payroll.createdAt, budgetYear, budgetMonth)
      )
      .reduce((sum, payroll) => sum + Number(payroll.netPay || 0), 0);
  }

  const expenses = await Expense.find();

  return expenses
    .filter((expense) => {
      const sameMonth = isWithinMonth(
        expense.date || expense.createdAt,
        budgetYear,
        budgetMonth
      );

      if (!sameMonth) return false;

      if (
        branch &&
        branch !== "All Branches" &&
        expense.branch &&
        expense.branch !== branch
      ) {
        return false;
      }

      if (category === "Other") return true;

      return (
        String(expense.category || "")
          .toLowerCase()
          .includes(String(category || "").toLowerCase()) ||
        String(expense.expenseGroup || "")
          .toLowerCase()
          .includes(String(category || "").toLowerCase()) ||
        String(expense.expenseClassification || "")
          .toLowerCase()
          .includes(String(category || "").toLowerCase())
      );
    })
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
};

const refreshBudgetActuals = async (budget) => {
  const actualAmount = roundMoney(
    await calculateActualAmount({
            category: budget.category,
      budgetYear: budget.budgetYear,
      budgetMonth: budget.budgetMonth,
      linkedChartAccountCode: budget.linkedChartAccountCode,
      branch: budget.branch,
    })
  );

  const plannedAmount = Number(budget.plannedAmount || 0);
  const variance =
    budget.category === "Revenue"
      ? roundMoney(actualAmount - plannedAmount)
      : roundMoney(plannedAmount - actualAmount);

  const variancePercent =
    plannedAmount > 0 ? roundMoney((variance / plannedAmount) * 100) : 0;

  budget.actualAmount = actualAmount;
  budget.variance = variance;
  budget.variancePercent = variancePercent;

  await budget.save();

  return budget;
};

const getBudgets = async (req, res) => {
  try {
    const budgets = await Budget.find().sort({
      budgetYear: -1,
      budgetMonth: -1,
      category: 1,
    });

    const refreshed = [];

    for (const budget of budgets) {
      refreshed.push(await refreshBudgetActuals(budget));
    }

    const totalPlanned = refreshed.reduce(
      (sum, item) => sum + Number(item.plannedAmount || 0),
      0
    );

    const totalActual = refreshed.reduce(
      (sum, item) => sum + Number(item.actualAmount || 0),
      0
    );

    const totalVariance = refreshed.reduce(
      (sum, item) => sum + Number(item.variance || 0),
      0
    );

            const overBudgetCount = refreshed.filter(
      (item) => Number(item.variance || 0) < 0
    ).length;

    const underBudgetCount = refreshed.filter(
      (item) => Number(item.variance || 0) >= 0
    ).length;

    const needsAttentionCount = refreshed.filter(
      (item) =>
        Number(item.variance || 0) < 0 &&
        Math.abs(Number(item.variancePercent || 0)) >= 10
    ).length;

    const onTargetCount = refreshed.filter(
      (item) => Math.abs(Number(item.variancePercent || 0)) <= 5
    ).length;

    const revenueAboveTargetCount = refreshed.filter(
      (item) =>
        item.category === "Revenue" && Number(item.variance || 0) > 0
    ).length;

    const budgetHealthScore =
      refreshed.length > 0
        ? roundMoney(
            ((refreshed.length - needsAttentionCount) / refreshed.length) * 100
          )
        : 100;

    res.json({
      success: true,
      summary: {
        totalBudgets: refreshed.length,
        totalPlanned,
        totalActual,
                totalVariance,
        overBudgetCount,
        underBudgetCount,
        needsAttentionCount,
        onTargetCount,
        revenueAboveTargetCount,
        budgetHealthScore,
      },
      data: refreshed,
    });
  } catch (error) {
    console.error("Budget load error:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve budgets",
      error: error.message,
    });
  }
};

const createBudget = async (req, res) => {
  try {
    const {
      budgetName,
      budgetYear,
      budgetMonth,
      category,
            branch,
      costCenter,
      linkedChartAccountCode,
      budgetType,
      frequency,
      plannedAmount,
      notes,
    } = req.body;

        let linkedChartAccountName = "";

    if (linkedChartAccountCode) {
      const chartAccount = await ChartOfAccount.findOne({
        accountCode: linkedChartAccountCode,
        status: "Active",
      });

      if (!chartAccount) {
        return res.status(404).json({
          success: false,
          message: "Selected Chart of Account was not found.",
        });
      }

      linkedChartAccountName = chartAccount.accountName;
    }

    const budget = await Budget.create({
      budgetNumber: `BUD-${Date.now()}`,
      budgetName,
      budgetYear: Number(budgetYear),
      budgetMonth: Number(budgetMonth),
      category,
            branch: branch || "All Branches",
      costCenter: costCenter || branch || "General",
      linkedChartAccountCode: linkedChartAccountCode || "",
      linkedChartAccountName,
      budgetType: budgetType || (category === "Revenue" ? "Revenue" : "Operating"),
      frequency: frequency || "Monthly",
      plannedAmount: Number(plannedAmount || 0),
      actualAmount: 0,
      variance: 0,
      variancePercent: 0,
      notes,
      status: "Active",
    });

    const refreshed = await refreshBudgetActuals(budget);

    res.status(201).json({
      success: true,
      message: "Budget created successfully",
      data: refreshed,
    });
  } catch (error) {
    console.error("Budget creation error:", error);
    res.status(500).json({
      success: false,
      message: "Could not create budget",
      error: error.message,
    });
  }
};

module.exports = {
  getBudgets,
  createBudget,
};