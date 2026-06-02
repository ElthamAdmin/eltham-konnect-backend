const ChartOfAccount = require("../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getTrialBalance = async (req, res) => {
  try {
    const accounts = await ChartOfAccount.find({ status: "Active" }).sort({
      accountCode: 1,
    });

    const ledgerTotals = await GeneralLedgerTransaction.aggregate([
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
        totalDebit: roundMoney(item.totalDebit),
        totalCredit: roundMoney(item.totalCredit),
      };
    });

    const rows = [];
    let totalDebit = 0;
    let totalCredit = 0;

    for (const account of accounts) {
      const totals = totalsMap[account.accountCode] || {
        totalDebit: 0,
        totalCredit: 0,
      };

      let balance = 0;

      if (account.normalBalance === "Debit") {
        balance = roundMoney(totals.totalDebit - totals.totalCredit);
      } else {
        balance = roundMoney(totals.totalCredit - totals.totalDebit);
      }

      let debit = 0;
      let credit = 0;

      if (balance >= 0) {
        if (account.normalBalance === "Debit") {
          debit = balance;
        } else {
          credit = balance;
        }
      } else {
        if (account.normalBalance === "Debit") {
          credit = Math.abs(balance);
        } else {
          debit = Math.abs(balance);
        }
      }

      debit = roundMoney(debit);
      credit = roundMoney(credit);

      totalDebit += debit;
      totalCredit += credit;

      rows.push({
        accountCode: account.accountCode,
        accountName: account.accountName,
        category: account.accountCategory,
        accountType: account.accountType,
        normalBalance: account.normalBalance,
        debit,
        credit,
      });
    }

    totalDebit = roundMoney(totalDebit);
    totalCredit = roundMoney(totalCredit);

    res.json({
      success: true,
      sourceOfTruth: "GeneralLedgerTransaction",
      balanced: totalDebit === totalCredit,
      totalDebit,
      totalCredit,
      difference: roundMoney(totalDebit - totalCredit),
      data: rows,
    });
  } catch (error) {
    console.error("Trial balance error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve trial balance",
      error: error.message,
    });
  }
};

module.exports = {
  getTrialBalance,
};