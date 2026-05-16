const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

const getGeneralLedger = async (req, res) => {
  try {
    const transactions = await GeneralLedgerTransaction.find().sort({
      entryDate: -1,
      createdAt: -1,
    });

    res.json({
      success: true,
      message: "General ledger retrieved successfully",
      data: transactions,
    });
  } catch (error) {
    console.error("Error loading general ledger:", error);
    res.status(500).json({
      success: false,
      message: "Could not retrieve general ledger",
      error: error.message,
    });
  }
};

module.exports = {
  getGeneralLedger,
};