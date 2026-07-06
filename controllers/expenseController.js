const Expense = require("../models/Expense");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const { writeAuditLog } = require("../utils/auditLogger");

const { postExpensePayment } = require("../services/accountingService");
const {
  accountMappingService,
} = require("../services/accountingEngine");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getReceiptFileExists = (receiptUrl = "") => {
  if (!receiptUrl) return false;

  const filename = String(receiptUrl).split("/").pop();
  if (!filename) return false;

  const path = require("path");
  const fs = require("fs");

  const filePath = path.join(
    __dirname,
    "..",
    "uploads",
    "expense-receipts",
    filename
  );

  return fs.existsSync(filePath);
};

const getExpenses = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;

    const total = await Expense.countDocuments();

    const expenseRecords = await Expense.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit);

    const expenses = expenseRecords.map((expense) => ({
      ...expense.toObject(),
      receiptFileExists: getReceiptFileExists(expense.receiptUrl),
    }));

    res.json({
      success: true,
      message: "Expenses retrieved successfully",
      totalExpenses: total,
      data: expenses,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("Error getting expenses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve expenses",
      error: error.message,
    });
  }
};

const createExpense = async (req, res) => {
  try {
    const {
      date,
      category,
      description,
      amount,
      status,
      paidFromAccountNumber,
    } = req.body;

    if (!date || !category || !description || !amount) {
      return res.status(400).json({
        success: false,
        message: "All expense fields are required",
      });
    }

    const numericAmount = roundMoney(amount);

    if (numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Expense amount must be greater than zero",
      });
    }

    let paidFromAccountName = "";
    let selectedFinancialAccount = null;

    if (paidFromAccountNumber) {
      selectedFinancialAccount = await FinancialAccount.findOne({
        accountNumber: paidFromAccountNumber,
      });

      if (!selectedFinancialAccount) {
        return res.status(404).json({
          success: false,
          message: "Selected financial account not found",
        });
      }

      const isCreditCard = selectedFinancialAccount.accountType === "Credit Card";

      if (
        !isCreditCard &&
        Number(selectedFinancialAccount.currentBalance || 0) < numericAmount
      ) {
        return res.status(400).json({
          success: false,
          message: "Insufficient balance in selected account",
        });
      }

      if (!selectedFinancialAccount.linkedChartAccountCode) {
        return res.status(400).json({
          success: false,
          message:
            "Selected financial account is not linked to a Chart of Accounts code.",
        });
      }

      paidFromAccountName = selectedFinancialAccount.accountName;
    }

        const categoryMeta =
      accountMappingService.getExpenseCategoryMeta(category);

    const expenseAccountCode = categoryMeta.accountCode;

    const journalEntry = await postExpensePayment({
      expenseAccountCode,
      paymentAccount: selectedFinancialAccount,
      amount: numericAmount,
      description: `${category}: ${description}`,
      reference: category,
      expenseDate: date,
      transactionDate: date,
      user: req.user,
    });

    const receiptUrl = req.file
      ? `/uploads/expense-receipts/${req.file.filename}`
      : "";

        const newExpense = await Expense.create({
      expenseNumber: `EXP-${Date.now()}`,
      date,
      category,
      expenseClassification: categoryMeta.classification,
      expenseGroup: categoryMeta.group,
      linkedChartAccountCode: categoryMeta.accountCode,
      linkedChartAccountName: categoryMeta.accountName,
      isCOGS: categoryMeta.isCOGS,
      description,
      amount: numericAmount,
      status: status || "Paid",
      paidFromAccountNumber: paidFromAccountNumber || "",
      paidFromAccountName,
      receiptUrl,
    });

    if (selectedFinancialAccount) {
      await AccountTransaction.create({
        transactionNumber: `TRN-${Date.now()}`,
        accountNumber: selectedFinancialAccount.accountNumber,
        accountName: selectedFinancialAccount.accountName,
        linkedChartAccountCode: selectedFinancialAccount.linkedChartAccountCode,
        journalEntryNumber: journalEntry.entryNumber,
        ledgerReference: journalEntry.entryNumber,
        transactionType:
          selectedFinancialAccount.accountType === "Credit Card"
            ? "Credit Card Charge"
            : "Expense Payment",
        amount: numericAmount,
        reference: category,
        notes: description,
        transactionDate: new Date(date),
      });
    }

    try {
      if (req.user) {
        await writeAuditLog({
          req,
          action: "CREATE_EXPENSE",
          module: "Finance",
          description: `Expense ${newExpense.expenseNumber} created for ${newExpense.category}`,
          targetType: "Expense",
          targetId: newExpense.expenseNumber,
          metadata: {
            amount: newExpense.amount,
            status: newExpense.status,
            paidFromAccountNumber: newExpense.paidFromAccountNumber,
            paidFromAccountName: newExpense.paidFromAccountName,
            receiptUrl: newExpense.receiptUrl,
                        journalEntryNumber: journalEntry.entryNumber,
            expenseClassification: newExpense.expenseClassification,
            expenseGroup: newExpense.expenseGroup,
            linkedChartAccountCode: newExpense.linkedChartAccountCode,
            linkedChartAccountName: newExpense.linkedChartAccountName,
            isCOGS: newExpense.isCOGS,
          },
        });
      }
    } catch (auditError) {
      console.error("Audit log error while creating expense:", auditError);
    }

    res.status(201).json({
      success: true,
      message: "Expense created and posted successfully",
      data: newExpense,
      journalEntryNumber: journalEntry.entryNumber,
    });
  } catch (error) {
    console.error("Error creating expense:", error);
        res.status(500).json({
      success: false,
      message: error.message || "Failed to create expense",
      error: error.message,
    });
  }
};

module.exports = {
  getExpenses,
  createExpense,
};