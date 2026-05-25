const ChartOfAccount = require("../models/ChartOfAccount");
const JournalEntry = require("../models/JournalEntry");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");
const Expense = require("../models/Expense");
const Payroll = require("../models/Payroll");
const Invoice = require("../models/Invoice");

const buildCSV = (headers, rows) => {
  const csvRows = [];

  csvRows.push(headers.join(","));

  for (const row of rows) {
    csvRows.push(
      row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    );
  }

  return csvRows.join("\n");
};

const exportTrialBalance = async (req, res) => {
  try {
    const accounts = await ChartOfAccount.find().sort({
      accountCode: 1,
    });

    const rows = accounts.map((account) => [
      account.accountCode,
      account.accountName,
      account.accountCategory,
      account.accountType,
      account.normalBalance,
      account.currentBalance || 0,
      account.status,
    ]);

    const csv = buildCSV(
      [
        "Account Code",
        "Account Name",
        "Category",
        "Type",
        "Normal Balance",
        "Current Balance",
        "Status",
      ],
      rows
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=trial-balance-${Date.now()}.csv`
    );

    res.setHeader("Content-Type", "text/csv");

    res.send(csv);
  } catch (error) {
    console.error("Trial balance export error:", error);

    res.status(500).json({
      success: false,
      message: "Could not export trial balance",
      error: error.message,
    });
  }
};

const exportGeneralLedger = async (req, res) => {
  try {
    const ledger = await GeneralLedgerTransaction.find().sort({
  createdAt: -1,
});

    const rows = ledger.map((entry) => [
      entry.entryDate,
      entry.entryNumber,
      entry.accountCode,
      entry.accountName,
      entry.accountCategory,
      entry.debit || 0,
      entry.credit || 0,
      entry.balance || 0,
      entry.reference || "",
      entry.memo || "",
      entry.sourceModule || "",
    ]);

    const csv = buildCSV(
      [
        "Date",
        "Journal Entry",
        "Account Code",
        "Account Name",
        "Category",
        "Debit",
        "Credit",
        "Balance",
        "Reference",
        "Memo",
        "Source Module",
      ],
      rows
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=general-ledger-${Date.now()}.csv`
    );

    res.setHeader("Content-Type", "text/csv");

    res.send(csv);
  } catch (error) {
    console.error("General ledger export error:", error);

    res.status(500).json({
      success: false,
      message: "Could not export general ledger",
      error: error.message,
    });
  }
};

const exportProfitAndLoss = async (req, res) => {
  try {
    const revenueAccounts = await ChartOfAccount.find({
      accountCategory: "Revenue",
    });

    const expenseAccounts = await ChartOfAccount.find({
      accountCategory: "Expense",
    });

    const rows = [];

    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const account of revenueAccounts) {
      totalRevenue += Number(account.currentBalance || 0);

      rows.push([
        "Revenue",
        account.accountCode,
        account.accountName,
        account.currentBalance || 0,
      ]);
    }

    rows.push([
      "",
      "",
      "Total Revenue",
      totalRevenue,
    ]);

    for (const account of expenseAccounts) {
      totalExpenses += Number(account.currentBalance || 0);

      rows.push([
        "Expense",
        account.accountCode,
        account.accountName,
        account.currentBalance || 0,
      ]);
    }

    rows.push([
      "",
      "",
      "Total Expenses",
      totalExpenses,
    ]);

    rows.push([
      "",
      "",
      "Net Profit/Loss",
      totalRevenue - totalExpenses,
    ]);

    const csv = buildCSV(
      [
        "Section",
        "Account Code",
        "Account Name",
        "Amount",
      ],
      rows
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=profit-loss-${Date.now()}.csv`
    );

    res.setHeader("Content-Type", "text/csv");

    res.send(csv);
  } catch (error) {
    console.error("Profit & loss export error:", error);

    res.status(500).json({
      success: false,
      message: "Could not export profit & loss",
      error: error.message,
    });
  }
};

const exportBalanceSheet = async (req, res) => {
  try {
    const accounts = await ChartOfAccount.find();

    const rows = accounts
      .filter((acc) =>
        ["Asset", "Liability", "Equity"].includes(
          acc.accountCategory
        )
      )
      .map((account) => [
        account.accountCategory,
        account.accountCode,
        account.accountName,
        account.currentBalance || 0,
      ]);

    const csv = buildCSV(
      [
        "Category",
        "Account Code",
        "Account Name",
        "Balance",
      ],
      rows
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=balance-sheet-${Date.now()}.csv`
    );

    res.setHeader("Content-Type", "text/csv");

    res.send(csv);
  } catch (error) {
    console.error("Balance sheet export error:", error);

    res.status(500).json({
      success: false,
      message: "Could not export balance sheet",
      error: error.message,
    });
  }
};

module.exports = {
  exportTrialBalance,
  exportGeneralLedger,
  exportProfitAndLoss,
  exportBalanceSheet,
};