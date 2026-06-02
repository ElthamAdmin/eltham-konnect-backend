const ChartOfAccount = require("../models/ChartOfAccount");
const { postJournalEntry } = require("../utils/generalLedgerPoster");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const closeAccountingPeriod = async (req, res) => {
  try {
    const incomeStatementAccounts = await ChartOfAccount.find({
      accountCategory: { $in: ["Revenue", "Expense", "Cost of Sales"] },
      status: "Active",
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
    const lines = [];

    for (const account of incomeStatementAccounts) {
      const balance = roundMoney(account.currentBalance || 0);

      if (balance === 0) continue;

      if (account.accountCategory === "Revenue") {
        totalRevenue += balance;

        lines.push({
          accountCode: account.accountCode,
          debit: balance,
          credit: 0,
          description: "Close revenue to retained earnings",
        });
      }

      if (
        account.accountCategory === "Expense" ||
        account.accountCategory === "Cost of Sales"
      ) {
        totalExpenses += balance;

        lines.push({
          accountCode: account.accountCode,
          debit: 0,
          credit: balance,
          description: "Close expense/cost of sales to retained earnings",
        });
      }
    }

    const netIncome = roundMoney(totalRevenue - totalExpenses);

    if (netIncome === 0 || lines.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No income statement balances to close",
      });
    }

    if (netIncome > 0) {
      lines.push({
        accountCode: "3100",
        debit: 0,
        credit: netIncome,
        description: "Net profit transferred to retained earnings",
      });
    } else {
      lines.push({
        accountCode: "3100",
        debit: Math.abs(netIncome),
        credit: 0,
        description: "Net loss transferred to retained earnings",
      });
    }

    const journalEntry = await postJournalEntry({
      entryDate: new Date().toISOString().split("T")[0],
      reference: `PERIOD-CLOSE-${Date.now()}`,
      sourceModule: "Accounting",
      memo: "Period closing entry",
      createdBy: req.user?.fullName || "System User",
      lines,
    });

    res.json({
      success: true,
      message: "Accounting period closed successfully",
      netIncome,
      journalEntry,
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