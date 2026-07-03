const ChartOfAccount = require("../models/ChartOfAccount");

const {
  postJournalEntry,
  postApprovedJournalEntry,
} = require("../services/accountingEngine/journalService");
const {
  rebuildAccountBalanceFromLedger,
  rebuildAllAccountBalancesFromLedger,
  syncFinancialAccountsForChartAccount,
} = require("../services/accountingEngine/balanceService");
const { SYSTEM_ACCOUNTS } = require("../services/accountingEngine/accountingConstants");

const SYSTEM_ACCOUNT_DEFINITIONS = [
  ["1000", "Cash on Hand", "Asset", "Debit", "Cash"],
  ["1010", "NCB Bank", "Asset", "Debit", "Bank"],
  ["1100", "Accounts Receivable", "Asset", "Debit", "Current Asset"],
  ["1200", "Inventory", "Asset", "Debit", "Current Asset"],

  ["2000", "Accounts Payable", "Liability", "Credit", "Current Liability"],
  ["2100", "PAYE Payable", "Liability", "Credit", "Payroll Tax Payable"],
  ["2110", "NIS Payable", "Liability", "Credit", "Payroll Tax Payable"],
  ["2120", "NHT Payable", "Liability", "Credit", "Payroll Tax Payable"],
  ["2130", "Education Tax Payable", "Liability", "Credit", "Payroll Tax Payable"],
  ["2140", "Pension Payable", "Liability", "Credit", "Payroll Payable"],

  ["3000", "Owner Capital", "Equity", "Credit", "Owner Capital"],
  ["3010", "Owner Contributions", "Equity", "Credit", "Owner Contributions"],
  ["3050", "Owner Drawings", "Equity", "Debit", "Owner Drawings"],
  ["3100", "Retained Earnings", "Equity", "Credit", "Retained Earnings"],
  ["3200", "Current Year Earnings", "Equity", "Credit", "Current Year Earnings"],
  ["3900", "Income Summary", "Equity", "Credit", "Temporary Closing Account"],

  ["4000", "Shipping Revenue", "Revenue", "Credit", "Income"],
  ["4010", "Marketplace Revenue", "Revenue", "Credit", "Income"],
  ["4020", "Delivery Revenue", "Revenue", "Credit", "Income"],

  ["5000", "Cost of Sales", "Cost of Sales", "Debit", "Cost of Sales"],

  ["6000", "Operating Expense", "Expense", "Debit", "Operating Expense"],
  ["6100", "Payroll Expense", "Expense", "Debit", "Payroll Expense"],
  ["6200", "Rent Expense", "Expense", "Debit", "Rent Expense"],
  ["6300", "Utilities Expense", "Expense", "Debit", "Utilities Expense"],
  ["6400", "Delivery Expense", "Expense", "Debit", "Delivery Expense"],
  ["6500", "Supplies Expense", "Expense", "Debit", "Supplies Expense"],
].map(([accountCode, accountName, accountCategory, normalBalance, accountType]) => ({
  accountCode,
  accountName,
  accountCategory,
  normalBalance,
  accountType,
}));

const ensureSystemAccounts = async () => {
  for (const account of SYSTEM_ACCOUNT_DEFINITIONS) {
    await ChartOfAccount.findOneAndUpdate(
      { accountCode: account.accountCode },
      {
        $set: {
          accountName: account.accountName,
          accountCategory: account.accountCategory,
          accountType: account.accountType,
          normalBalance: account.normalBalance,
          status: "Active",
          isSystemAccount: true,
        },
        $setOnInsert: {
          currentBalance: 0,
          openingBalance: 0,
        },
      },
      { upsert: true, new: true }
    );
  }
};

module.exports = {
  postJournalEntry,
  postApprovedJournalEntry,
  ensureSystemAccounts,
  rebuildAccountBalanceFromLedger,
  rebuildAllAccountBalancesFromLedger,
  syncFinancialAccountsForChartAccount,
  SYSTEM_ACCOUNTS,
};