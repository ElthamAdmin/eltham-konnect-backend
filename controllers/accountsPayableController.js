const Vendor = require("../models/Vendor");
const AccountsPayable = require("../models/AccountsPayable");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");

const getVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find().sort({
      vendorName: 1,
    });

    res.json({
      success: true,
      data: vendors,
    });
  } catch (error) {
    console.error("Vendor load error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve vendors",
      error: error.message,
    });
  }
};

const createVendor = async (req, res) => {
  try {
    const {
      vendorName,
      vendorType,
      contactPerson,
      email,
      phone,
      address,
      openingBalance,
    } = req.body;

    const vendor = await Vendor.create({
      vendorCode: `VEN-${Date.now()}`,
      vendorName,
      vendorType,
      contactPerson,
      email,
      phone,
      address,
      openingBalance: Number(openingBalance || 0),
      currentBalance: Number(openingBalance || 0),
    });

    res.status(201).json({
      success: true,
      message: "Vendor created successfully",
      data: vendor,
    });
  } catch (error) {
    console.error("Vendor creation error:", error);

    res.status(500).json({
      success: false,
      message: "Could not create vendor",
      error: error.message,
    });
  }
};

const getAccountsPayable = async (req, res) => {
  try {
    const payables = await AccountsPayable.find().sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: payables,
    });
  } catch (error) {
    console.error("Accounts payable error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve payables",
      error: error.message,
    });
  }
};

const createAccountsPayable = async (req, res) => {
  try {
    const {
      vendorCode,
      billNumber,
      payableDate,
      dueDate,
      description,
      amount,
      notes,
    } = req.body;

    const vendor = await Vendor.findOne({
      vendorCode,
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const payable = await AccountsPayable.create({
      payableNumber: `AP-${Date.now()}`,
      vendorCode: vendor.vendorCode,
      vendorName: vendor.vendorName,
      billNumber,
      payableDate,
      dueDate,
      description,
      amount: Number(amount || 0),
      amountPaid: 0,
      balanceDue: Number(amount || 0),
      status: "Unpaid",
      notes,
    });

    vendor.currentBalance += Number(amount || 0);
    await vendor.save();

    res.status(201).json({
      success: true,
      message: "Accounts payable created successfully",
      data: payable,
    });
  } catch (error) {
    console.error("Accounts payable creation error:", error);

    res.status(500).json({
      success: false,
      message: "Could not create accounts payable",
      error: error.message,
    });
  }
};

const markAccountsPayablePaid = async (req, res) => {
  try {
    const { payableNumber } = req.params;
    const { paymentAccountNumber, paymentDate, notes } = req.body;

    if (!paymentAccountNumber) {
      return res.status(400).json({
        success: false,
        message: "Payment account is required",
      });
    }

    const payable = await AccountsPayable.findOne({ payableNumber });

    if (!payable) {
      return res.status(404).json({
        success: false,
        message: "Accounts payable record not found",
      });
    }

    if (payable.status === "Paid") {
      return res.status(400).json({
        success: false,
        message: "This payable is already marked as paid",
      });
    }

    const account = await FinancialAccount.findOne({
      accountNumber: paymentAccountNumber,
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Payment account not found",
      });
    }

    const paymentAmount = Number(payable.balanceDue || payable.amount || 0);

    payable.amountPaid = Number(payable.amount || 0);
    payable.balanceDue = 0;
    payable.status = "Paid";
    payable.paymentAccountNumber = account.accountNumber;
    payable.paymentAccountName = account.accountName;
    payable.notes = notes || payable.notes || "";

    await payable.save();

    const vendor = await Vendor.findOne({
      vendorCode: payable.vendorCode,
    });

    if (vendor) {
      vendor.currentBalance = Math.max(
        0,
        Number(vendor.currentBalance || 0) - paymentAmount
      );
      await vendor.save();
    }

    account.balance = Number(account.balance || 0) - paymentAmount;
    await account.save();

    await AccountTransaction.create({
      transactionNumber: `TXN-${Date.now()}`,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      type: "Expense",
      category: "Accounts Payable",
      description: `Paid payable ${payable.payableNumber} - ${payable.vendorName}`,
      amount: paymentAmount,
      transactionDate: paymentDate || new Date().toISOString().slice(0, 10),
      reference: payable.payableNumber,
    });

    res.json({
      success: true,
      message: "Accounts payable marked as paid successfully",
      data: payable,
    });
  } catch (error) {
    console.error("Mark payable paid error:", error);

    res.status(500).json({
      success: false,
      message: "Could not mark payable as paid",
      error: error.message,
    });
  }
};

module.exports = {
  getVendors,
  createVendor,
  getAccountsPayable,
  createAccountsPayable,
  markAccountsPayablePaid,
};