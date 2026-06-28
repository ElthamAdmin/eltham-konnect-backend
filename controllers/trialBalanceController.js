const { trialBalanceService } = require("../services/accountingEngine");

const getTrialBalance = async (req, res) => {
  try {
    const { from = "", to = "" } = req.query;

    const trialBalance = await trialBalanceService.buildTrialBalance({
      from,
      to,
    });

    res.json({
      success: true,
      sourceOfTruth: "GeneralLedgerTransaction",
      balanced: trialBalance.totals.isBalanced,
      totalDebit: trialBalance.totals.totalDebits,
      totalCredit: trialBalance.totals.totalCredits,
      difference: trialBalance.totals.difference,

      data: trialBalance.rows.map((row) => ({
        accountCode: row.accountCode,
        accountName: row.accountName,
        category: row.accountCategory,
        accountType: row.accountType,
        normalBalance: row.normalBalance,
        debit: row.trialDebit,
        credit: row.trialCredit,
        debitTotal: row.debitTotal,
        creditTotal: row.creditTotal,
        naturalBalance: row.naturalBalance,
      })),

      engine: trialBalance,
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