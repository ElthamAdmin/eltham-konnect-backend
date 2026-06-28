const Payroll = require("../models/Payroll");
const HREmployee = require("../models/HREmployee");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const { writeAuditLog } = require("../utils/auditLogger");
const { postPayrollPayment } = require("../services/accountingService");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const JAMAICA_NIS_EMPLOYEE_RATE = 0.025;
const JAMAICA_NHT_EMPLOYEE_RATE = 0.02;
const JAMAICA_EDUCATION_TAX_RATE = 0.0225;
const JAMAICA_INCOME_TAX_RATE = 0.25;
const JAMAICA_ANNUAL_PIT_THRESHOLD = 2003496;
const JAMAICA_MONTHLY_PIT_THRESHOLD = JAMAICA_ANNUAL_PIT_THRESHOLD / 12;
const JAMAICA_NIS_ANNUAL_WAGE_CEILING = 5000000;
const JAMAICA_NIS_MONTHLY_WAGE_CEILING = JAMAICA_NIS_ANNUAL_WAGE_CEILING / 12;

const calculateJamaicanPayrollDeductions = ({ grossPay, pensionEmployee = 0 }) => {
  const gross = roundMoney(grossPay);
  const pension = roundMoney(pensionEmployee);

  const nisBase = Math.min(gross, JAMAICA_NIS_MONTHLY_WAGE_CEILING);
  const nisEmployee = roundMoney(nisBase * JAMAICA_NIS_EMPLOYEE_RATE);
  const nhtEmployee = roundMoney(gross * JAMAICA_NHT_EMPLOYEE_RATE);
  const educationTax = roundMoney(gross * JAMAICA_EDUCATION_TAX_RATE);

  const taxableIncome = Math.max(0, roundMoney(gross - pension));
  const taxableOverThreshold = Math.max(
    0,
    roundMoney(taxableIncome - JAMAICA_MONTHLY_PIT_THRESHOLD)
  );
  const incomeTax = roundMoney(taxableOverThreshold * JAMAICA_INCOME_TAX_RATE);

  const totalDeductions = roundMoney(
    nisEmployee + nhtEmployee + educationTax + incomeTax + pension
  );

  return {
    grossPay: gross,
    nisEmployee,
    nhtEmployee,
    educationTax,
    incomeTax,
    pensionEmployee: pension,
    totalDeductions,
    netPay: roundMoney(gross - totalDeductions),
  };
};

const getPayroll = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const skip = (page - 1) * limit;

    const total = await Payroll.countDocuments();

    const payroll = await Payroll.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      message: "Payroll records retrieved successfully",
      totalPayroll: total,
      data: payroll,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("Error getting payroll:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve payroll records",
      error: error.message,
    });
  }
};

const getMyPayroll = async (req, res) => {
  try {
    const linkedEmployeeId = req.user?.linkedEmployeeId || "";
    const userId = req.user?.userId || "";

    let employee = null;

    if (linkedEmployeeId) {
      employee = await HREmployee.findOne({ employeeId: linkedEmployeeId });
    }

    if (!employee && userId) {
      employee = await HREmployee.findOne({ linkedUserId: userId });
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "No HR employee profile is linked to this user",
      });
    }

    const payroll = await Payroll.find({ employeeId: employee.employeeId }).sort({
      createdAt: -1,
      _id: -1,
    });

    res.json({
      success: true,
      message: "My payroll records retrieved successfully",
      data: payroll,
    });
  } catch (error) {
    console.error("Error getting my payroll:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve my payroll records",
      error: error.message,
    });
  }
};

const createPayroll = async (req, res) => {
  try {
    const {
      employeeId,
      employeeName,
      role,
      payPeriod,
      grossPay,
      deductions,
      status,
      nisEmployee,
      nhtEmployee,
      educationTax,
      incomeTax,
      pensionEmployee,
      autoCalculateStatutoryDeductions,
      paidFromAccountNumber,
    } = req.body;

    if (!payPeriod || !grossPay || !paidFromAccountNumber) {
      return res.status(400).json({
        success: false,
        message: "Pay period, gross pay, and payment account are required",
      });
    }

    let finalEmployeeId = "";
    let finalEmployeeName = employeeName || "";
    let finalRole = role || "";
    let finalGrossPay = roundMoney(grossPay);

    if (employeeId) {
      const employee = await HREmployee.findOne({ employeeId });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Selected employee not found",
        });
      }

      finalEmployeeId = employee.employeeId;
      finalEmployeeName = employee.fullName;
      finalRole = employee.jobTitle;
      finalGrossPay = roundMoney(grossPay || employee.payRate || 0);
    }

    if (!finalEmployeeName || !finalRole || finalGrossPay <= 0) {
      return res.status(400).json({
        success: false,
        message: "Employee name, role, and valid gross pay are required",
      });
    }

    const selectedFinancialAccount = await FinancialAccount.findOne({
      accountNumber: paidFromAccountNumber,
    });

    if (!selectedFinancialAccount) {
      return res.status(404).json({
        success: false,
        message: "Selected payroll payment account not found",
      });
    }

    if (!selectedFinancialAccount.linkedChartAccountCode) {
      return res.status(400).json({
        success: false,
        message:
          "Selected payroll payment account is not linked to a Chart of Accounts code.",
      });
    }

    const hasDetailedManualDeductions =
      nisEmployee !== undefined ||
      nhtEmployee !== undefined ||
      educationTax !== undefined ||
      incomeTax !== undefined ||
      pensionEmployee !== undefined;

    let payrollBreakdown;

    if (
      autoCalculateStatutoryDeductions === true ||
      autoCalculateStatutoryDeductions === "true" ||
      (!hasDetailedManualDeductions && !deductions)
    ) {
      payrollBreakdown = calculateJamaicanPayrollDeductions({
        grossPay: finalGrossPay,
        pensionEmployee: Number(pensionEmployee || 0),
      });
    } else if (hasDetailedManualDeductions) {
      payrollBreakdown = {
        grossPay: finalGrossPay,
        nisEmployee: roundMoney(nisEmployee),
        nhtEmployee: roundMoney(nhtEmployee),
        educationTax: roundMoney(educationTax),
        incomeTax: roundMoney(incomeTax),
        pensionEmployee: roundMoney(pensionEmployee),
      };

      payrollBreakdown.totalDeductions = roundMoney(
        payrollBreakdown.nisEmployee +
          payrollBreakdown.nhtEmployee +
          payrollBreakdown.educationTax +
          payrollBreakdown.incomeTax +
          payrollBreakdown.pensionEmployee
      );

      payrollBreakdown.netPay = roundMoney(
        payrollBreakdown.grossPay - payrollBreakdown.totalDeductions
      );
    } else {
      const safeDeductions = Math.max(0, roundMoney(deductions));

      payrollBreakdown = {
        grossPay: finalGrossPay,
        nisEmployee: 0,
        nhtEmployee: 0,
        educationTax: 0,
        incomeTax: 0,
        pensionEmployee: 0,
        totalDeductions: safeDeductions,
        netPay: roundMoney(finalGrossPay - safeDeductions),
      };
    }

    if (
      selectedFinancialAccount.accountType !== "Credit Card" &&
      Number(selectedFinancialAccount.currentBalance || 0) <
        Number(payrollBreakdown.netPay || 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance in selected payroll payment account",
      });
    }

    const newPayroll = await Payroll.create({
      payrollNumber: `PAY-${Date.now()}`,
      employeeId: finalEmployeeId,
      employeeName: finalEmployeeName,
      role: finalRole,
      payPeriod,
      grossPay: payrollBreakdown.grossPay,
      deductions: payrollBreakdown.totalDeductions,
      nisEmployee: payrollBreakdown.nisEmployee,
      nhtEmployee: payrollBreakdown.nhtEmployee,
      educationTax: payrollBreakdown.educationTax,
      incomeTax: payrollBreakdown.incomeTax,
      pensionEmployee: payrollBreakdown.pensionEmployee,
      totalDeductions: payrollBreakdown.totalDeductions,
      netPay: payrollBreakdown.netPay,
      paidFromAccountNumber,
      paidFromAccountName: selectedFinancialAccount.accountName,
      status: status || "Paid",
    });

    const journalEntry = await postPayrollPayment({
      paymentAccount: selectedFinancialAccount,
      payroll: newPayroll,
      user: req.user,
    });

    await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}`,
      accountNumber: selectedFinancialAccount.accountNumber,
      accountName: selectedFinancialAccount.accountName,
      linkedChartAccountCode: selectedFinancialAccount.linkedChartAccountCode,
      journalEntryNumber: journalEntry.entryNumber,
      ledgerReference: journalEntry.entryNumber,
      transactionType: "Payroll Payment",
      amount: Number(payrollBreakdown.netPay || 0),
      reference: `Payroll ${payPeriod}`,
      notes: `Payroll payment for ${finalEmployeeName}`,
      transactionDate: new Date(),
    });

    try {
      if (req.user) {
        await writeAuditLog({
          req,
          action: "CREATE_PAYROLL",
          module: "Finance",
          description: `Payroll ${newPayroll.payrollNumber} created for ${newPayroll.employeeName}`,
          targetType: "Payroll",
          targetId: newPayroll.payrollNumber,
          metadata: {
            employeeId: newPayroll.employeeId,
            employeeName: newPayroll.employeeName,
            grossPay: newPayroll.grossPay,
            netPay: newPayroll.netPay,
            paidFromAccountNumber: newPayroll.paidFromAccountNumber,
            paidFromAccountName: newPayroll.paidFromAccountName,
            journalEntryNumber: journalEntry.entryNumber,
          },
        });
      }
    } catch (auditError) {
      console.error("Audit log error while creating payroll:", auditError);
    }

    res.status(201).json({
      success: true,
      message: "Payroll record created and posted successfully",
      data: newPayroll,
      journalEntryNumber: journalEntry.entryNumber,
    });
  } catch (error) {
    console.error("Error creating payroll:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payroll record",
      error: error.message,
    });
  }
};

module.exports = {
  getPayroll,
  getMyPayroll,
  createPayroll,
};