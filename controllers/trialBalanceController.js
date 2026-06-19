const ChartOfAccount = require("../models/ChartOfAccount");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getTrialBalance = async (req, res) => {
  try {
    const accounts = await ChartOfAccount.find({ status: "Active" }).sort({
      accountCode: 1,
    });

    const rows = [];
    let totalDebit = 0;
    let totalCredit = 0;

    for (const account of accounts) {
      const balance = roundMoney(account.currentBalance || 0);

      let debit = 0;
      let credit = 0;

      switch (account.accountCategory) {
        case "Asset":
        case "Expense":
        case "Cost of Sales":
          if (balance >= 0) {
            debit = balance;
          } else {
            credit = Math.abs(balance);
          }
          break;

        case "Liability":
        case "Equity":
        case "Revenue":
          if (balance >= 0) {
            credit = balance;
          } else {
            debit = Math.abs(balance);
          }
          break;

        default:
          if (account.normalBalance === "Debit") {
            debit = Math.abs(balance);
          } else {
            credit = Math.abs(balance);
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
      sourceOfTruth: "ChartOfAccount.currentBalance",
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