const ChartOfAccount = require("../models/ChartOfAccount");
const AccountingPeriod = require("../models/AccountingPeriod");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");
const { postJournalEntry } = require("../utils/generalLedgerPoster");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const closeAccountingPeriod = async (req, res) => {
  try {
    const { fiscalYear, periodMonth } = req.body;

    if (!fiscalYear || !periodMonth) {
      return res.status(400).json({
        success: false,
        message: "Fiscal year and period month are required.",
      });
    }

    const period = await AccountingPeriod.findOne({
      fiscalYear: Number(fiscalYear),
      periodMonth: Number(periodMonth),
    });

    if (!period) {
      return res.status(404).json({
        success: false,
        message: "Accounting period not found.",
      });
    }

    if (period.status !== "Open") {
      return res.status(400).json({
        success: false,
        message: `Accounting period is already ${period.status}.`,
      });
    }

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
        message: "Retained Earnings account missing.",
      });
    }

    const ledgerTotals = await GeneralLedgerTransaction.aggregate([
      {
        $match: {
          entryDate: {
            $gte: period.startDate,
            $lte: period.endDate,
          },
          accountCategory: { $in: ["Revenue", "Expense", "Cost of Sales"] },
        },
      },
      {
        $group: {
          _id: "$accountCode",
          totalDebit: { $sum: "$debit" },
          totalCredit: { $sum: "$credit" },
        },
      },
    ]);

    const totalsMap = {};
    ledgerTotals.forEach((item) => {
      totalsMap[item._id] = {
        debit: roundMoney(item.totalDebit),
        credit: roundMoney(item.totalCredit),
      };
    });

    let totalRevenue = 0;
    let totalExpenses = 0;
    const lines = [];

    for (const account of incomeStatementAccounts) {
      const totals = totalsMap[account.accountCode] || {
        debit: 0,
        credit: 0,
      };

      let balance = 0;

      if (account.accountCategory === "Revenue") {
        balance = roundMoney(totals.credit - totals.debit);
        if (balance > 0) {
          totalRevenue += balance;
          lines.push({
            accountCode: account.accountCode,
            debit: balance,
            credit: 0,
            description: "Close revenue to retained earnings",
          });
        }
      }

      if (
        account.accountCategory === "Expense" ||
        account.accountCategory === "Cost of Sales"
      ) {
        balance = roundMoney(totals.debit - totals.credit);
        if (balance > 0) {
          totalExpenses += balance;
          lines.push({
            accountCode: account.accountCode,
            debit: 0,
            credit: balance,
            description: "Close expense/cost of sales to retained earnings",
          });
        }
      }
    }

    const netIncome = roundMoney(totalRevenue - totalExpenses);

    if (netIncome === 0 || lines.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No income statement ledger balances to close.",
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
      entryDate: period.endDate,
      reference: `PERIOD-CLOSE-${period.periodNumber}`,
      sourceModule: "Accounting",
      memo: `Period closing entry for ${period.periodName}`,
      createdBy: req.user?.fullName || "System User",
      lines,
    });

    period.status = "Closed";
    period.closedAt = new Date();
    period.closedBy = req.user?.fullName || "System User";
    await period.save();

    res.json({
      success: true,
      message: "Accounting period closed successfully.",
      netIncome,
      journalEntry,
      period,
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