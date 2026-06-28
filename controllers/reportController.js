const Invoice = require("../models/Invoice");
const Payroll = require("../models/Payroll");
const ChartOfAccount = require("../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

const {
  rebuildAllAccountBalancesFromLedger,
} = require("../utils/generalLedgerPoster");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizeDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;

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
    if (!Number.isNaN(parsedFrom.getTime())) startDate = parsedFrom;
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

const getFinanceSummary = async (req, res) => {
  try {
    const { filter = "today", from = "", to = "", branch = "" } = req.query;

    const getJamaicaYMD = (date = new Date()) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Jamaica",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);

    const makeJamaicaUtcStart = (ymd) => new Date(`${ymd}T05:00:00.000Z`);

    const addDays = (date, days) => {
      const copy = new Date(date);
      copy.setUTCDate(copy.getUTCDate() + days);
      return copy;
    };

    const jamaicaTodayYMD = getJamaicaYMD();

    let startDate = makeJamaicaUtcStart(jamaicaTodayYMD);
    let endDate = new Date(addDays(startDate, 1).getTime() - 1);

    if (filter === "thisWeek") {
      const day = new Date(`${jamaicaTodayYMD}T00:00:00`).getDay();
      const diff = day === 0 ? 6 : day - 1;
      startDate = addDays(startDate, -diff);
      endDate = new Date(addDays(startDate, 7).getTime() - 1);
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
      endDate = new Date(makeJamaicaUtcStart(`${Number(year) + 1}-01-01`).getTime() - 1);
    }

    if (filter === "allTime") {
      startDate = null;
      endDate = null;
    }

    if (filter === "custom" && from && to) {
      startDate = makeJamaicaUtcStart(from);
      endDate = new Date(addDays(makeJamaicaUtcStart(to), 1).getTime() - 1);
    }

    const isWithinSummaryRange = (value) => {
      if (!startDate || !endDate) return true;
      if (!value) return false;

      const date =
        typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? makeJamaicaUtcStart(value)
          : normalizeDateValue(value);

      return date && date >= startDate && date <= endDate;
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
        .reduce((sum, item) => sum + Number(item.credit || 0) - Number(item.debit || 0), 0)
    );

    const totalExpenses = roundMoney(
      filteredLedger
        .filter(
          (item) =>
            item.accountCategory === "Expense" ||
            item.accountCategory === "Cost of Sales"
        )
        .reduce((sum, item) => sum + Number(item.debit || 0) - Number(item.credit || 0), 0)
    );

    const totalPayroll = roundMoney(
      filteredLedger
        .filter(
          (item) =>
            String(item.accountName || "").toLowerCase().includes("payroll") ||
            String(item.sourceModule || "").toLowerCase().includes("payroll")
        )
        .reduce((sum, item) => sum + Number(item.debit || 0) - Number(item.credit || 0), 0)
    );

    const branchMatches = (record) => {
      if (!branch) return true;
      return String(record.branch || record.customerBranch || "").trim() === branch;
    };

    const unpaidInvoices = invoices.filter(
      (inv) =>
        String(inv.status || "").trim().toLowerCase() === "unpaid" &&
        branchMatches(inv)
    );

    const paidInvoices = invoices.filter((inv) => {
      const statusIsPaid = String(inv.status || "").trim().toLowerCase() === "paid";
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
            (String(account.accountName || "").toLowerCase().includes("cash") ||
              String(account.accountName || "").toLowerCase().includes("bank"))
        )
        .reduce((sum, account) => sum + Number(account.currentBalance || 0), 0)
    );

    res.json({
      success: true,
      data: {
        filters: { filter, from, to, branch, startDate, endDate },
        totalRevenue,
        outstandingRevenue,
        totalExpenses,
        totalPayroll,
        paidInvoices: paidInvoices.length,
        unpaidInvoices: unpaidInvoices.length,
        cashOnHand,
        netPosition: roundMoney(totalRevenue - totalExpenses),
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

    const calculateLedgerCategoryTotal = (category, normalSide = "Credit") =>
      roundMoney(
        filteredLedger
          .filter((item) => item.accountCategory === category)
          .reduce((sum, item) => {
            const debit = Number(item.debit || 0);
            const credit = Number(item.credit || 0);
            return normalSide === "Debit" ? sum + debit - credit : sum + credit - debit;
          }, 0)
      );

    const getLedgerBalanceByCategory = (category) =>
      roundMoney(
        chartAccounts
          .filter((account) => account.accountCategory === category)
          .reduce((sum, account) => {
            const accountLedger = filteredLedger.filter(
              (entry) => entry.accountCode === account.accountCode
            );

            const debitTotal = accountLedger.reduce(
              (ledgerSum, item) => ledgerSum + Number(item.debit || 0),
              0
            );

            const creditTotal = accountLedger.reduce(
              (ledgerSum, item) => ledgerSum + Number(item.credit || 0),
              0
            );

            const balance =
              account.normalBalance === "Debit"
                ? debitTotal - creditTotal
                : creditTotal - debitTotal;

            return sum + balance;
          }, 0)
      );

    const revenue = calculateLedgerCategoryTotal("Revenue", "Credit");
    const costOfSales = calculateLedgerCategoryTotal("Cost of Sales", "Debit");
    const operatingExpenses = calculateLedgerCategoryTotal("Expense", "Debit");
    const totalExpenses = roundMoney(costOfSales + operatingExpenses);
    const grossProfit = roundMoney(revenue - costOfSales);
    const netProfit = roundMoney(revenue - totalExpenses);

    const totalAssets = getLedgerBalanceByCategory("Asset");
    const totalLiabilities = getLedgerBalanceByCategory("Liability");
    const totalEquity = getLedgerBalanceByCategory("Equity");

    const accountBalance = (accountCode, normalSide = "Debit") =>
      roundMoney(
        filteredLedger
          .filter((entry) => entry.accountCode === accountCode)
          .reduce((sum, entry) => {
            const debit = Number(entry.debit || 0);
            const credit = Number(entry.credit || 0);
            return normalSide === "Debit" ? sum + debit - credit : sum + credit - debit;
          }, 0)
      );

    const cashOnHand = roundMoney(
      chartAccounts
        .filter(
          (account) =>
            account.accountCategory === "Asset" &&
            (String(account.accountName || "").toLowerCase().includes("cash") ||
              String(account.accountName || "").toLowerCase().includes("bank") ||
              String(account.accountType || "").toLowerCase().includes("bank"))
        )
        .reduce((sum, account) => sum + accountBalance(account.accountCode, "Debit"), 0)
    );

    const accountsReceivable = accountBalance("1100", "Debit");
    const accountsPayable = accountBalance("2000", "Credit");

    const payrollExpense = roundMoney(
      filteredLedger
        .filter(
          (item) =>
            item.accountCategory === "Expense" &&
            String(item.accountName || "").toLowerCase().includes("payroll")
        )
        .reduce((sum, item) => sum + Number(item.debit || 0) - Number(item.credit || 0), 0)
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
      .map(([category, amount]) => ({ category, amount: roundMoney(amount) }))
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
        monthMap[monthKey].revenue = roundMoney(monthMap[monthKey].revenue + credit - debit);
      }

      if (item.accountCategory === "Expense" || item.accountCategory === "Cost of Sales") {
        const expenseAmount = debit - credit;
        monthMap[monthKey].expenses = roundMoney(monthMap[monthKey].expenses + expenseAmount);

        if (String(item.accountName || "").toLowerCase().includes("payroll")) {
          monthMap[monthKey].payroll = roundMoney(monthMap[monthKey].payroll + expenseAmount);
        }
      }
    });

    const monthlyTrend = Object.values(monthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((item) => ({
        ...item,
        net: roundMoney(Number(item.revenue || 0) - Number(item.expenses || 0)),
      }));

    const payroll = await Payroll.find();
    const filteredPayroll = payroll.filter((item) =>
      isDateWithinRange(item.payPeriod || item.createdAt, startDate, endDate)
    );

    const statutoryTotals = {
      nisEmployee: roundMoney(filteredPayroll.reduce((sum, item) => sum + Number(item.nisEmployee || 0), 0)),
      nhtEmployee: roundMoney(filteredPayroll.reduce((sum, item) => sum + Number(item.nhtEmployee || 0), 0)),
      educationTax: roundMoney(filteredPayroll.reduce((sum, item) => sum + Number(item.educationTax || 0), 0)),
      incomeTax: roundMoney(filteredPayroll.reduce((sum, item) => sum + Number(item.incomeTax || 0), 0)),
      pensionEmployee: roundMoney(filteredPayroll.reduce((sum, item) => sum + Number(item.pensionEmployee || 0), 0)),
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

    const cashFlow = {
      cashInflowFromRevenue: roundMoney(
        filteredLedger
          .filter((item) => item.accountCategory === "Asset" && Number(item.debit || 0) > 0)
          .reduce((sum, item) => sum + Number(item.debit || 0), 0)
      ),
      cashOutflowForExpenses: roundMoney(
        filteredLedger
          .filter((item) => item.accountCategory === "Asset" && Number(item.credit || 0) > 0)
          .reduce((sum, item) => sum + Number(item.credit || 0), 0)
      ),
    };

    cashFlow.netCashFlow = roundMoney(
      cashFlow.cashInflowFromRevenue - cashFlow.cashOutflowForExpenses
    );

    const adjustedEquity = roundMoney(totalEquity + netProfit);

    res.json({
      success: true,
      data: {
        filters: { from, to },
        reportMeta: {
          generatedAt: new Date().toISOString(),
          reportTitle: "Ledger-Based Financial Reports",
          sourceOfTruth: "GeneralLedgerTransaction + ChartOfAccount",
        },
        profitAndLoss: {
          revenue,
          costOfSales,
          grossProfit,
          operatingExpenses,
          payrollExpense,
          totalExpenses,
          netProfit,
        },
        cashFlow,
        balanceSheet: {
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
            currentProfitOrLoss: netProfit,
            adjustedEquity,
            accountingEquationEquity: roundMoney(totalAssets - totalLiabilities),
          },
          check: {
            assetsMinusLiabilitiesAndEquity: roundMoney(
              totalAssets - totalLiabilities - adjustedEquity
            ),
          },
        },
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

    ledgerTransactions.forEach((item) => {
      const monthKey = toMonthKey(item.entryDate || item.createdAt);
      if (!monthKey) return;

      if (!monthMap[monthKey]) {
        monthMap[monthKey] = {
          month: monthKey,
          income: 0,
          expenses: 0,
        };
      }

      if (item.accountCategory === "Revenue") {
        monthMap[monthKey].income = roundMoney(
          monthMap[monthKey].income + Number(item.credit || 0) - Number(item.debit || 0)
        );
      }

      if (item.accountCategory === "Expense" || item.accountCategory === "Cost of Sales") {
        monthMap[monthKey].expenses = roundMoney(
          monthMap[monthKey].expenses + Number(item.debit || 0) - Number(item.credit || 0)
        );
      }
    });

    res.json({
      success: true,
      data: Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)),
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

const rebuildFinanceBalances = async (req, res) => {
  try {
    const rebuiltAccounts = await rebuildAllAccountBalancesFromLedger();

    res.json({
      success: true,
      message: "Finance balances rebuilt successfully from General Ledger.",
      totalAccountsRebuilt: rebuiltAccounts.length,
      data: rebuiltAccounts,
    });
  } catch (error) {
    console.error("Error rebuilding finance balances:", error);
    res.status(500).json({
      success: false,
      message: "Failed to rebuild finance balances",
      error: error.message,
    });
  }
};

module.exports = {
  getFinanceSummary,
  getFinancialReports,
  getMonthlyIncomeVsExpenses,
  rebuildFinanceBalances,
};