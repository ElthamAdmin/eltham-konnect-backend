const Vendor = require("../models/Vendor");
const AccountsPayable = require("../models/AccountsPayable");

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

module.exports = {
  getVendors,
  createVendor,
  getAccountsPayable,
  createAccountsPayable,
};