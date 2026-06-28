const ChartOfAccount = require("../models/ChartOfAccount");

const { postJournalEntry } = require("../services/accountingEngine/journalService");
const {
  rebuildAccountBalanceFromLedger,
  rebuildAllAccountBalancesFromLedger,
  syncFinancialAccountsForChartAccount,
} = require("../services/accountingEngine/balanceService");
const { SYSTEM_ACCOUNTS } = require("../services/accountingEngine/accountingConstants");

const SYSTEM_ACCOUNT_DEFINITIONS = [
  ["1000", "Cash on Hand", "Asset", "Debit"],
  ["1010", "NCB Bank", "Asset", "Debit"],
  ["1100", "Accounts Receivable", "Asset", "Debit"],
  ["1200", "Inventory", "Asset", "Debit"],
  ["2000", "Accounts Payable", "Liability", "Credit"],
  ["2100", "PAYE Payable", "Liability", "Credit"],
  ["2110", "NIS Payable", "Liability", "Credit"],
  ["2120", "NHT Payable", "Liability", "Credit"],
  ["2130", "Education Tax Payable", "Liability", "Credit"],
  ["2140", "Pension Payable", "Liability", "Credit"],
  ["3000", "Owner Equity", "Equity", "Credit"],
  ["3050", "Owner Drawings", "Equity", "Debit"],
  ["3100", "Retained Earnings", "Equity", "Credit"],
  ["4000", "Shipping Revenue", "Revenue", "Credit"],
  ["4010", "Marketplace Revenue", "Revenue", "Credit"],
  ["4020", "Delivery Revenue", "Revenue", "Credit"],
  ["5000", "Cost of Sales", "Cost of Sales", "Debit"],
  ["6000", "Operating Expense", "Expense", "Debit"],
  ["6100", "Payroll Expense", "Expense", "Debit"],
  ["6200", "Rent Expense", "Expense", "Debit"],
  ["6300", "Utilities Expense", "Expense", "Debit"],
  ["6400", "Delivery Expense", "Expense", "Debit"],
  ["6500", "Supplies Expense", "Expense", "Debit"],
].map(([accountCode, accountName, accountCategory, normalBalance]) => ({
  accountCode,
  accountName,
  accountCategory,
  normalBalance,
}));

const ensureSystemAccounts = async () => {
  for (const account of SYSTEM_ACCOUNT_DEFINITIONS) {
    await ChartOfAccount.findOneAndUpdate(
      { accountCode: account.accountCode },
      {
        $setOnInsert: {
          ...account,
          currentBalance: 0,
          openingBalance: 0,
          status: "Active",
          isSystemAccount: true,
        },
      },
      { upsert: true, new: true }
    );
  }
};

module.exports = {
  postJournalEntry,
  ensureSystemAccounts,
  rebuildAccountBalanceFromLedger,
  rebuildAllAccountBalancesFromLedger,
  syncFinancialAccountsForChartAccount,
  SYSTEM_ACCOUNTS,
};