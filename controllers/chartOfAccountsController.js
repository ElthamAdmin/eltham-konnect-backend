const ChartOfAccount = require("../models/ChartOfAccount");
const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

const getAccounts = async (req, res) => {
  try {

    const accounts = await ChartOfAccount.find({
      status: "Active",
    }).sort({
      accountCode: 1,
    });

    res.json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    console.error("Error getting accounts:", error);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve chart of accounts",
      error: error.message,
    });
  }
};

const createAccount = async (req, res) => {
  try {
    const {
      accountCode,
      accountName,
      accountCategory,
      accountType,
      parentAccountCode,
      openingBalance,
      normalBalance,
      description,
    } = req.body;

    if (
      !accountCode ||
      !accountName ||
      !accountCategory ||
      !normalBalance
    ) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing",
      });
    }

    const requestedOpening = Number(openingBalance ?? 0);
    const requestedCurrent = Number(
      req.body.currentBalance ?? 0
    );

    if (
      !Number.isFinite(requestedOpening) ||
      requestedOpening !== 0 ||
      !Number.isFinite(requestedCurrent) ||
      requestedCurrent !== 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Create the account with zero balance. Opening balances require a separate reviewed journal.",
      });
    }

    const existing = await ChartOfAccount.findOne({
      accountCode,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Account code already exists",
      });
    }

    const account = await ChartOfAccount.create({
      accountCode,
      accountName,
      accountCategory,
      accountType,
      parentAccountCode,
      openingBalance: 0,
      currentBalance: 0,
      normalBalance,
      description,
    });

    return res.status(201).json({
      success: true,
      message:
        "Account created at zero balance. Opening balances require a separate reviewed journal.",
      data: account,
    });
  } catch (error) {
    console.error("Error creating account:", error);

    return res.status(error.code === 11000 ? 409 : 500).json({
      success: false,
      message:
        error.code === 11000
          ? "Account code already exists"
          : "Failed to create account",
      error: error.message,
    });
  }
};

const getChartHealth = async (req, res) => {
  try {
       const accounts = await ChartOfAccount.find();

    const inactiveAccounts = accounts.filter((account) => account.status === "Inactive");
    const systemAccounts = accounts.filter((account) => account.isSystemAccount);
    const manualBlocked = accounts.filter((account) => account.allowManualEntries === false);
    const missingNormalBalance = accounts.filter((account) => !account.normalBalance);
    const missingCategory = accounts.filter((account) => !account.accountCategory);

    const duplicateCodes = [];
    const codeMap = {};

    accounts.forEach((account) => {
      codeMap[account.accountCode] = Number(codeMap[account.accountCode] || 0) + 1;
    });

    Object.entries(codeMap).forEach(([accountCode, count]) => {
      if (count > 1) duplicateCodes.push(accountCode);
    });

    const healthIssues =
      missingNormalBalance.length +
      missingCategory.length +
      duplicateCodes.length;

    res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter((account) => account.status === "Active").length,
        inactiveAccounts: inactiveAccounts.length,
        systemAccounts: systemAccounts.length,
        manualBlocked: manualBlocked.length,
        missingNormalBalance: missingNormalBalance.length,
        missingCategory: missingCategory.length,
        duplicateCodes: duplicateCodes.length,
        duplicateAccountCodes: duplicateCodes,
        healthIssues,
        healthStatus: healthIssues === 0 ? "Healthy" : "Needs Review",
      },
    });
  } catch (error) {
    console.error("Chart health error:", error);

    res.status(500).json({
      success: false,
      message: "Could not run chart of accounts health check",
      error: error.message,
    });
  }
};

const getAccountTree = async (req, res) => {
  try {

    const accounts = await ChartOfAccount.find({ status: "Active" }).sort({
      accountCode: 1,
    });

    const ledgerUsage = await GeneralLedgerTransaction.aggregate([
      {
        $group: {
          _id: "$accountCode",
          transactionCount: { $sum: 1 },
          totalDebit: { $sum: "$debit" },
          totalCredit: { $sum: "$credit" },
        },
      },
    ]);

    const usageMap = {};
    ledgerUsage.forEach((item) => {
      usageMap[item._id] = item;
    });

    const accountMap = {};
    const rootAccounts = [];

    accounts.forEach((account) => {
      const usage = usageMap[account.accountCode] || {};

      accountMap[account.accountCode] = {
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountCategory: account.accountCategory,
        accountType: account.accountType || "",
        parentAccountCode: account.parentAccountCode || "",
        currentBalance: Number(account.currentBalance || 0),
        normalBalance: account.normalBalance,
        isSystemAccount: account.isSystemAccount,
        allowManualEntries: account.allowManualEntries,
        transactionCount: Number(usage.transactionCount || 0),
        totalDebit: Number(usage.totalDebit || 0),
        totalCredit: Number(usage.totalCredit || 0),
        children: [],
      };
    });

    Object.values(accountMap).forEach((account) => {
      if (account.parentAccountCode && accountMap[account.parentAccountCode]) {
        accountMap[account.parentAccountCode].children.push(account);
      } else {
        rootAccounts.push(account);
      }
    });

    const categories = [
      "Asset",
      "Liability",
      "Equity",
      "Revenue",
      "Cost of Sales",
      "Expense",
    ].map((category) => ({
      category,
      accounts: rootAccounts.filter((account) => account.accountCategory === category),
    }));

    res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        categories,
      },
    });
  } catch (error) {
    console.error("Account tree error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load account tree",
      error: error.message,
    });
  }
};

module.exports = {
  getAccounts,
  createAccount,
  getChartHealth,
  getAccountTree,
};