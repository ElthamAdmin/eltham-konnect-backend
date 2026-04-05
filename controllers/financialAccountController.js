const FinancialAccount = require("../models/FinancialAccount");

const createAccount = async (req, res) => {
  try {
    const { accountName, accountType, bankName, openingBalance } = req.body;

    if (!accountName || !accountType) {
      return res.status(400).json({
        success: false,
        message: "Account name and account type are required",
      });
    }

    const numericOpeningBalance = Number(openingBalance || 0);

    const accountNumber = `ACC-${Date.now()}`;

    const account = await FinancialAccount.create({
      accountNumber,
      accountName,
      accountType,
      bankName,
      openingBalance: numericOpeningBalance,
      currentBalance: numericOpeningBalance,
    });

    res.json({
      success: true,
      message: "Financial account created",
      data: account,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Could not create account",
      error: error.message,
    });
  }
};

const getAccounts = async (req, res) => {
  try {
    const accounts = await FinancialAccount.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not retrieve accounts",
      error: error.message,
    });
  }
};

const updateAccount = async (req, res) => {
  try {
    const { accountNumber } = req.params;
    const { accountName, accountType, bankName, openingBalance, status } = req.body;

    const account = await FinancialAccount.findOne({ accountNumber });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Financial account not found",
      });
    }

    const oldOpeningBalance = Number(account.openingBalance || 0);
    const newOpeningBalance =
      openingBalance !== undefined
        ? Number(openingBalance || 0)
        : oldOpeningBalance;

    const balanceDifference = newOpeningBalance - oldOpeningBalance;

    if (accountName !== undefined) account.accountName = accountName;
    if (accountType !== undefined) account.accountType = accountType;
    if (bankName !== undefined) account.bankName = bankName;
    if (status !== undefined) account.status = status;

    if (openingBalance !== undefined) {
      account.openingBalance = newOpeningBalance;
      account.currentBalance = Number(account.currentBalance || 0) + balanceDifference;
    }

    await account.save();

    res.json({
      success: true,
      message: "Financial account updated successfully",
      data: account,
    });
  } catch (error) {
    console.error("Update account error:", error);
    res.status(500).json({
      success: false,
      message: "Could not update account",
      error: error.message,
    });
  }
};

module.exports = {
  createAccount,
  getAccounts,
  updateAccount,
};