const ChartOfAccount = require("../models/ChartOfAccount");
const { ensureSystemAccounts } = require("../utils/generalLedgerPoster");
const {
  rebuildAllAccountBalancesFromLedger,
} = require("../services/accountingEngine");

const getAccounts = async (req, res) => {
  try {
    await ensureSystemAccounts();
    await rebuildAllAccountBalancesFromLedger();

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

    if (!accountCode || !accountName || !accountCategory || !normalBalance) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing",
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
      openingBalance: Number(openingBalance || 0),
      currentBalance: Number(openingBalance || 0),
      normalBalance,
      description,
    });

    await rebuildAllAccountBalancesFromLedger();

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      data: account,
    });
  } catch (error) {
    console.error("Error creating account:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create account",
      error: error.message,
    });
  }
};

module.exports = {
  getAccounts,
  createAccount,
};