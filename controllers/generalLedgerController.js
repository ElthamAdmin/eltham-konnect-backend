const GeneralLedgerTransaction = require("../models/GeneralLedgerTransaction");

const getGeneralLedger = async (req, res) => {
  try {
    const {
      accountCode,
      sourceModule,
      entryNumber,
      startDate,
      endDate,
    } = req.query;

    const filter = {};

    if (accountCode) filter.accountCode = accountCode;
    if (sourceModule) filter.sourceModule = sourceModule;
    if (entryNumber) filter.entryNumber = entryNumber;

    if (startDate || endDate) {
      filter.entryDate = {};
      if (startDate) filter.entryDate.$gte = startDate;
      if (endDate) filter.entryDate.$lte = endDate;
    }

    const transactions = await GeneralLedgerTransaction.find(filter).sort({
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

const getGeneralLedgerHealth = async (req, res) => {
  try {
    const transactions = await GeneralLedgerTransaction.find();

    const totalDebit = transactions.reduce(
      (sum, line) => sum + Number(line.debit || 0),
      0
    );

    const totalCredit = transactions.reduce(
      (sum, line) => sum + Number(line.credit || 0),
      0
    );

    const entryMap = {};

    transactions.forEach((line) => {
      if (!entryMap[line.entryNumber]) {
        entryMap[line.entryNumber] = {
          entryNumber: line.entryNumber,
          debit: 0,
          credit: 0,
          lines: 0,
        };
      }

      entryMap[line.entryNumber].debit += Number(line.debit || 0);
      entryMap[line.entryNumber].credit += Number(line.credit || 0);
      entryMap[line.entryNumber].lines += 1;
    });

    const unbalancedEntries = Object.values(entryMap).filter(
      (entry) =>
        Number(entry.debit.toFixed(2)) !== Number(entry.credit.toFixed(2))
    );

    const orphanLines = transactions.filter(
      (line) => !line.entryNumber || !line.accountCode
    );

    const difference = Number((totalDebit - totalCredit).toFixed(2));

    res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        totalLines: transactions.length,
        totalDebit,
        totalCredit,
        difference,
        isBalanced: difference === 0,
        unbalancedEntryCount: unbalancedEntries.length,
        orphanLineCount: orphanLines.length,
        healthStatus:
          difference === 0 && unbalancedEntries.length === 0 && orphanLines.length === 0
            ? "Healthy"
            : "Needs Review",
        unbalancedEntries,
        orphanLines,
      },
    });
  } catch (error) {
    console.error("General ledger health error:", error);

    res.status(500).json({
      success: false,
      message: "Could not run general ledger health check",
      error: error.message,
    });
  }
};

module.exports = {
  getGeneralLedger,
  getGeneralLedgerHealth,
};