const ChartOfAccount = require("../models/ChartOfAccount");
const JournalEntry = require("../models/JournalEntry");
const { postJournalEntry } = require("../utils/generalLedgerPoster");

const closeAccountingPeriod = async (req, res) => {
  try {
    const revenueAccounts = await ChartOfAccount.find({
      accountCategory: "Revenue",
    });

    const expenseAccounts = await ChartOfAccount.find({
      accountCategory: "Expense",
    });

    const retainedEarnings = await ChartOfAccount.findOne({
      accountCode: "3100",
    });

    if (!retainedEarnings) {
      return res.status(400).json({
        success: false,
        message: "Retained Earnings account missing",
      });
    }

    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const account of revenueAccounts) {
      totalRevenue += Number(account.currentBalance || 0);
    }

    for (const account of expenseAccounts) {
      totalExpenses += Number(account.currentBalance || 0);
    }

    const netIncome = totalRevenue - totalExpenses;

    if (netIncome === 0) {
      return res.status(400).json({
        success: false,
        message: "No net income to close",
      });
    }

    const lines = [];

    for (const account of revenueAccounts) {
      const balance = Number(account.currentBalance || 0);

      if (balance <= 0) continue;

      lines.push({
        accountCode: account.accountCode,
        accountName: account.accountName,
        debit: balance,
        credit: 0,
        description: "Period closing entry",
      });

      account.currentBalance = 0;
      await account.save();
    }

    for (const account of expenseAccounts) {
      const balance = Number(account.currentBalance || 0);

      if (balance <= 0) continue;

      lines.push({
        accountCode: account.accountCode,
        accountName: account.accountName,
        debit: 0,
        credit: balance,
        description: "Period closing entry",
      });

      account.currentBalance = 0;
      await account.save();
    }

    if (netIncome > 0) {
      lines.push({
        accountCode: retainedEarnings.accountCode,
        accountName: retainedEarnings.accountName,
        debit: 0,
        credit: netIncome,
        description: "Net profit transferred to retained earnings",
      });

      retainedEarnings.currentBalance += netIncome;
    } else {
      lines.push({
        accountCode: retainedEarnings.accountCode,
        accountName: retainedEarnings.accountName,
        debit: Math.abs(netIncome),
        credit: 0,
        description: "Net loss transferred to retained earnings",
      });

      retainedEarnings.currentBalance -= Math.abs(netIncome);
    }

    await retainedEarnings.save();

    const journalEntry = await postJournalEntry({
  entryDate: new Date().toISOString().split("T")[0],
  reference: "PERIOD-CLOSE",
  sourceModule: "Accounting",
  memo: "Period closing entry",
  createdBy: req.user?.fullName || "System User",
  lines,
});

    res.json({
      success: true,
      message: "Accounting period closed successfully",
      netIncome,
    });
  } catch (error) {
    console.error("Error closing accounting period:", error);

    res.status(500).json({
      success: false,
      message: "Could not close accounting period",
      error: error.message,
    });
  }
};

module.exports = {
  closeAccountingPeriod,
};