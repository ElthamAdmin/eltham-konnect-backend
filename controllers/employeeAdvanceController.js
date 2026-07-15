const EmployeeAdvance = require("../models/EmployeeAdvance");
const HREmployee = require("../models/HREmployee");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const { postEmployeeAdvanceFunding } = require("../services/accountingService");
const { ensureSystemAccounts } = require("../utils/generalLedgerPoster");
const { writeAuditLog } = require("../utils/auditLogger");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const getEmployeeAdvances = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.employeeId) {
      filter.employeeId = String(req.query.employeeId).trim();
    }

    if (req.query.status) {
      filter.status = String(req.query.status).trim();
    }

    const [total, advances] = await Promise.all([
      EmployeeAdvance.countDocuments(filter),
      EmployeeAdvance.find(filter)
        .sort({ advanceDate: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    return res.json({
      success: true,
      message: "Employee advances retrieved successfully",
      data: advances,
      pagination: {
        total,
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
        limit,
      },
    });
  } catch (error) {
    console.error("Error getting employee advances:", error);
    return res.status(500).json({
      success: false,
      message: "Could not retrieve employee advances",
      error: error.message,
    });
  }
};

const createEmployeeAdvance = async (req, res) => {
  try {
    const {
      employeeId,
      advanceType = "Payment on Behalf",
      description,
      payeeName = "",
      amount,
      advanceDate,
      recoveryStartPeriod = "",
      plannedInstallmentAmount,
      paymentAccountNumber,
      notes = "",
    } = req.body;

    const numericAmount = roundMoney(amount);
    const installment = roundMoney(plannedInstallmentAmount || numericAmount);
    const parsedAdvanceDate = /^\d{4}-\d{2}-\d{2}$/.test(
      String(advanceDate || "")
    )
      ? new Date(`${advanceDate}T12:00:00.000Z`)
      : new Date(advanceDate);

    if (
      !employeeId ||
      !description ||
      numericAmount <= 0 ||
      !advanceDate ||
      !paymentAccountNumber
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Employee, description, amount, advance date, and payment account are required",
      });
    }

    if (installment <= 0 || installment > numericAmount) {
      return res.status(400).json({
        success: false,
        message:
          "Planned installment must be greater than zero and cannot exceed the advance amount",
      });
    }

    if (Number.isNaN(parsedAdvanceDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "A valid advance date is required",
      });
    }

    const [employee, paymentAccount] = await Promise.all([
      HREmployee.findOne({ employeeId }),
      FinancialAccount.findOne({
        accountNumber: paymentAccountNumber,
        status: "Active",
        accountType: { $in: ["Bank", "Cash"] },
      }),
    ]);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Selected employee was not found",
      });
    }

    if (!paymentAccount) {
      return res.status(404).json({
        success: false,
        message: "Select an active Bank or Cash payment account",
      });
    }

    if (!paymentAccount.linkedChartAccountCode) {
      return res.status(400).json({
        success: false,
        message:
          "Selected payment account is not linked to a Chart of Accounts code",
      });
    }

    if (Number(paymentAccount.currentBalance || 0) < numericAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance in the selected payment account",
      });
    }

    await ensureSystemAccounts();

    const advanceNumber = `ADV-${Date.now()}`;
    const journalEntry = await postEmployeeAdvanceFunding({
      paymentAccount,
      amount: numericAmount,
      advanceNumber,
      employeeId: employee.employeeId,
      employeeName: employee.fullName,
      description,
      advanceDate,
      user: req.user,
    });

    const transaction = await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}-ADV`,
      accountNumber: paymentAccount.accountNumber,
      accountName: paymentAccount.accountName,
      linkedChartAccountCode: paymentAccount.linkedChartAccountCode,
      journalEntryNumber: journalEntry.entryNumber,
      ledgerReference: journalEntry.entryNumber,
      transactionType: "Employee Advance Payment",
      amount: numericAmount,
      reference: advanceNumber,
      notes: `${description}${payeeName ? ` - Paid to ${payeeName}` : ""}`,
      transactionDate: parsedAdvanceDate,
    });

    const advance = await EmployeeAdvance.create({
      advanceNumber,
      employeeId: employee.employeeId,
      employeeName: employee.fullName,
      advanceType,
      description,
      payeeName,
      originalAmount: numericAmount,
      recoveredAmount: 0,
      outstandingBalance: numericAmount,
      advanceDate: parsedAdvanceDate,
      recoveryStartPeriod,
      plannedInstallmentAmount: installment,
      paymentAccountNumber: paymentAccount.accountNumber,
      paymentAccountName: paymentAccount.accountName,
      fundingJournalEntryNumber: journalEntry.entryNumber,
      fundingTransactionNumber: transaction.transactionNumber,
      status: "Open",
      notes,
      createdBy: getUserName(req.user),
    });

    try {
      await writeAuditLog({
        req,
        action: "CREATE_EMPLOYEE_ADVANCE",
        module: "Payroll",
        description: `Employee advance ${advanceNumber} created for ${employee.fullName}`,
        targetType: "EmployeeAdvance",
        targetId: advanceNumber,
        journalEntryNumber: journalEntry.entryNumber,
        accountNumber: paymentAccount.accountNumber,
        accountName: paymentAccount.accountName,
        metadata: {
          employeeId: employee.employeeId,
          employeeName: employee.fullName,
          amount: numericAmount,
          payeeName,
          advanceDate,
          recoveryStartPeriod,
          plannedInstallmentAmount: installment,
        },
      });
    } catch (auditError) {
      console.error("Employee advance audit error:", auditError);
    }

    return res.status(201).json({
      success: true,
      message: "Employee advance funded and recorded successfully",
      data: advance,
      journalEntryNumber: journalEntry.entryNumber,
      transactionNumber: transaction.transactionNumber,
    });
  } catch (error) {
    console.error("Error creating employee advance:", error);
    return res.status(500).json({
      success: false,
      message: "Could not create employee advance",
      error: error.message,
    });
  }
};

module.exports = {
  getEmployeeAdvances,
  createEmployeeAdvance,
};