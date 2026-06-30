const Vendor = require("../models/Vendor");
const AccountsPayable = require("../models/AccountsPayable");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const ChartOfAccount = require("../models/ChartOfAccount");

const accountingService = require("../services/accountingService");
const { roundMoney } = require("../services/accountingEngine/money");

const todayYMD = () => new Date().toISOString().slice(0, 10);

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const generateTransactionNumber = () =>
  `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const generatePaymentReference = () =>
  `APPAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const getVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find().sort({ vendorName: 1 });

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

    if (!vendorName) {
      return res.status(400).json({
        success: false,
        message: "Vendor name is required",
      });
    }

    const balance = roundMoney(openingBalance || 0);

    const vendor = await Vendor.create({
      vendorCode: `VEN-${Date.now()}`,
      vendorName,
      vendorType,
      contactPerson,
      email,
      phone,
      address,
      openingBalance: balance,
      currentBalance: balance,
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
    const payables = await AccountsPayable.find().sort({ createdAt: -1 });

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
      expenseAccountCode,
      amount,
      notes,
    } = req.body;

    if (!vendorCode) {
      return res.status(400).json({
        success: false,
        message: "Vendor code is required",
      });
    }

    const payableAmount = roundMoney(amount || 0);

    if (payableAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payable amount must be greater than zero",
      });
    }

    const vendor = await Vendor.findOne({ vendorCode, status: "Active" });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Active vendor not found",
      });
    }

    const postingAccountCode = expenseAccountCode || "6000";

    const expenseAccount = await ChartOfAccount.findOne({
      accountCode: postingAccountCode,
      status: "Active",
    });

    if (!expenseAccount) {
      return res.status(404).json({
        success: false,
        message: "Expense account not found or inactive",
      });
    }

    const payable = await AccountsPayable.create({
      payableNumber: `AP-${Date.now()}`,
      vendorCode: vendor.vendorCode,
      vendorName: vendor.vendorName,
      billNumber,
      payableDate: payableDate || todayYMD(),
      dueDate,
      description,
      expenseAccountCode: expenseAccount.accountCode,
      expenseAccountName: expenseAccount.accountName,
      amount: payableAmount,
      amountPaid: 0,
      balanceDue: payableAmount,
      status: "Unpaid",
      approvalStatus: "Not Required",
      notes,
      paymentHistory: [],
      createdBy: getUserName(req.user),
    });

    const journalEntry = await accountingService.postVendorBill({
      payable,
      expenseAccountCode: expenseAccount.accountCode,
      amount: payableAmount,
      user: req.user,
    });

    payable.journalEntryNumber = journalEntry.entryNumber;
    await payable.save();

    vendor.currentBalance = roundMoney(
      Number(vendor.currentBalance || 0) + payableAmount
    );
    await vendor.save();

    res.status(201).json({
      success: true,
      message: "Accounts payable bill created and posted successfully",
      data: payable,
      journalEntry,
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

    const {
      paymentAccountNumber,
      paymentDate,
      paymentAmount,
      paymentMethod,
      paymentReference,
      notes,
    } = req.body;

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

    if (["Paid", "Void"].includes(payable.status)) {
      return res.status(400).json({
        success: false,
        message: `This payable cannot be paid because it is ${payable.status}`,
      });
    }

    const balanceDue = roundMoney(payable.balanceDue || 0);
    const amountToPay = paymentAmount
      ? roundMoney(paymentAmount)
      : balanceDue;

    if (amountToPay <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be greater than zero",
      });
    }

    if (amountToPay > balanceDue) {
      return res.status(400).json({
        success: false,
        message: "Payment amount cannot exceed payable balance due",
      });
    }

    const account = await FinancialAccount.findOne({
      accountNumber: paymentAccountNumber,
      status: "Active",
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Active payment account not found",
      });
    }

    if (!account.linkedChartAccountCode) {
      return res.status(400).json({
        success: false,
        message: "Payment account is not linked to the Chart of Accounts",
      });
    }

    const finalPaymentReference = paymentReference || generatePaymentReference();

    const duplicatePayment = await AccountsPayable.findOne({
      "paymentHistory.paymentReference": finalPaymentReference,
    });

    if (duplicatePayment) {
      return res.status(400).json({
        success: false,
        message: "This payment reference has already been used",
      });
    }

    const transactionDate = paymentDate || todayYMD();

    const journalEntry = await accountingService.payVendorBill({
      payable,
      paymentAccount: account,
      amount: amountToPay,
      paymentDate: transactionDate,
      paymentReference: finalPaymentReference,
      user: req.user,
    });

    const accountTransaction = await AccountTransaction.create({
      transactionNumber: generateTransactionNumber(),
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      linkedChartAccountCode: account.linkedChartAccountCode,
      journalEntryNumber: journalEntry.entryNumber,
      ledgerReference: payable.payableNumber,
      transactionType:
        account.accountType === "Credit Card"
          ? "Credit Card Payment"
          : "Expense Payment",
      amount: amountToPay,
      paymentMethod: paymentMethod || "Bank Transfer",
      reference: finalPaymentReference,
      notes: notes || `Payment for ${payable.payableNumber}`,
      transactionDate,
    });

    payable.amountPaid = roundMoney(Number(payable.amountPaid || 0) + amountToPay);
    payable.balanceDue = roundMoney(balanceDue - amountToPay);
    payable.status = payable.balanceDue === 0 ? "Paid" : "Partially Paid";
    payable.paymentAccountNumber = account.accountNumber;
    payable.paymentAccountName = account.accountName;
    payable.lastPaymentDate = transactionDate;
    payable.notes = notes || payable.notes || "";

    if (!Array.isArray(payable.paymentHistory)) {
      payable.paymentHistory = [];
    }

    payable.paymentHistory.push({
      paymentDate: transactionDate,
      paymentAmount: amountToPay,
      paymentAccountNumber: account.accountNumber,
      paymentAccountName: account.accountName,
      paymentMethod: paymentMethod || "Bank Transfer",
      paymentReference: finalPaymentReference,
      journalEntryNumber: journalEntry.entryNumber,
      accountTransactionNumber: accountTransaction.transactionNumber,
      notes: notes || "",
      paidBy: getUserName(req.user),
    });

    await payable.save();

    const vendor = await Vendor.findOne({ vendorCode: payable.vendorCode });

    if (vendor) {
      vendor.currentBalance = Math.max(
        0,
        roundMoney(Number(vendor.currentBalance || 0) - amountToPay)
      );
      await vendor.save();
    }

    res.json({
      success: true,
      message:
        payable.status === "Paid"
          ? "Accounts payable bill paid and posted successfully"
          : "Partial accounts payable payment recorded and posted successfully",
      data: payable,
      journalEntry,
      accountTransaction,
    });
  } catch (error) {
    console.error("Mark payable paid error:", error);

    res.status(500).json({
      success: false,
      message: "Could not record payable payment",
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