const FinancialAccount = require("../models/FinancialAccount");

const createAccount = async (req, res) => {

  try {

    const {
      accountName,
      accountType,
      bankName,
      openingBalance
    } = req.body;

    const accountNumber = `ACC-${Date.now()}`;

    const account = await FinancialAccount.create({

      accountNumber,
      accountName,
      accountType,
      bankName,
      openingBalance,
      currentBalance: openingBalance

    });

    res.json({
      success: true,
      message: "Financial account created",
      data: account
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Could not create account"
    });

  }

};


const getAccounts = async (req, res) => {

  try {

    const accounts = await FinancialAccount.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: accounts
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: "Could not retrieve accounts"
    });

  }

};

module.exports = {
  createAccount,
  getAccounts
};