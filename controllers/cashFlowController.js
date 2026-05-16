const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");

const getCashFlowStatement = async (req, res) => {
  try {
    const transactions = await AccountTransaction.find();

    let operatingInflows = 0;
    let operatingOutflows = 0;

    let investingInflows = 0;
    let investingOutflows = 0;

    let financingInflows = 0;
    let financingOutflows = 0;

    for (const trx of transactions) {
      const amount = Number(trx.amount || 0);

      // OPERATING ACTIVITIES
      if (trx.transactionType === "Invoice Payment") {
        operatingInflows += amount;
      }

      if (
        trx.transactionType === "Expense Payment" ||
        trx.transactionType === "Payroll Payment"
      ) {
        operatingOutflows += amount;
      }

      // FINANCING ACTIVITIES
      if (trx.transactionType === "Loan Received") {
        financingInflows += amount;
      }

      if (
        trx.transactionType === "Loan Payment" ||
        trx.transactionType === "Credit Card Payment"
      ) {
        financingOutflows += amount;
      }

      // INVESTING ACTIVITIES
      if (trx.transactionType === "Asset Purchase") {
        investingOutflows += amount;
      }

      if (trx.transactionType === "Asset Sale") {
        investingInflows += amount;
      }
    }

    const netOperatingCashFlow =
      operatingInflows - operatingOutflows;

    const netInvestingCashFlow =
      investingInflows - investingOutflows;

    const netFinancingCashFlow =
      financingInflows - financingOutflows;

    const accounts = await FinancialAccount.find();

    const totalCashBalance = accounts.reduce(
      (sum, acc) =>
        sum + Number(acc.currentBalance || 0),
      0
    );

    res.json({
      success: true,

      data: {
        operatingActivities: {
          inflows: operatingInflows,
          outflows: operatingOutflows,
          net: netOperatingCashFlow,
        },

        investingActivities: {
          inflows: investingInflows,
          outflows: investingOutflows,
          net: netInvestingCashFlow,
        },

        financingActivities: {
          inflows: financingInflows,
          outflows: financingOutflows,
          net: netFinancingCashFlow,
        },

        openingCashBalance: 0,

        closingCashBalance: totalCashBalance,

        netCashMovement:
          netOperatingCashFlow +
          netInvestingCashFlow +
          netFinancingCashFlow,
      },
    });
  } catch (error) {
    console.error(
      "Cash Flow Statement Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Could not generate cash flow statement",
      error: error.message,
    });
  }
};

module.exports = {
  getCashFlowStatement,
};