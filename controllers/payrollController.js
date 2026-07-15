const Payroll = require("../models/Payroll");
const HREmployee = require("../models/HREmployee");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const { writeAuditLog } = require("../utils/auditLogger");
const { postPayrollPayment } = require("../services/accountingService");
const {
  calculateJamaicanPayroll,
  normalizePayrollDate,
  roundMoney,
} = require("../services/payrollCalculationService");

const {
  buildEmployeeAdvanceRecoveryPlan,
  applyEmployeeAdvanceRecoveries,
} = require("../services/employeeAdvanceService");

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const getPayroll = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.employeeId) {
      filter.employeeId = String(req.query.employeeId).trim();
    }

    if (req.query.payPeriod) {
      filter.payPeriod = String(req.query.payPeriod).trim();
    }

    if (req.query.status) {
      filter.status = String(req.query.status).trim();
    }

    const [total, payroll] = await Promise.all([
      Payroll.countDocuments(filter),
      Payroll.find(filter)
        .sort({ payDate: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    res.json({
      success: true,
      message: "Payroll records retrieved successfully",
      totalPayroll: total,
      data: payroll,
      pagination: {
        total,
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
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
      payDate: -1,
      createdAt: -1,
      _id: -1,
    });

    return res.json({
      success: true,
      message: "My payroll records retrieved successfully",
      data: payroll,
    });
  } catch (error) {
    console.error("Error getting my payroll:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve my payroll records",
      error: error.message,
    });
  }
};

const previewPayroll = async (req, res) => {
  try {
        const {
      grossPay,
      pensionEmployee = 0,
      payPeriod,
      payDate,
      payFrequency = "Monthly",
      employeeId = "",
      applyEmployeeAdvances = true,
      requestedAdvanceRecovery,
    } = req.body;

    if (Number(grossPay || 0) <= 0 || !payPeriod) {
      return res.status(400).json({
        success: false,
        message: "Pay period and valid gross pay are required",
      });
    }

        const calculation = await calculateJamaicanPayroll({
      grossPay,
      pensionEmployee,
      payPeriod,
      payDate,
      payFrequency,
    });

    const shouldApplyAdvances =
      applyEmployeeAdvances === true ||
      applyEmployeeAdvances === "true";

    const recoveryPlan = shouldApplyAdvances
      ? await buildEmployeeAdvanceRecoveryPlan({
          employeeId,
          payPeriod,
          availableNetPay: calculation.netPay,
          requestedRecoveryAmount: requestedAdvanceRecovery,
        })
      : {
          totalAdvanceRecovery: 0,
          allocations: [],
        };

    const netPayBeforeAdvance = calculation.netPay;

    const finalNetPay = roundMoney(
      netPayBeforeAdvance - recoveryPlan.totalAdvanceRecovery
    );

    return res.json({
      success: true,
      message: "Payroll preview calculated successfully",
      data: {
        ...calculation,
        netPayBeforeAdvance,
        advanceRecovery: recoveryPlan.totalAdvanceRecovery,
        advanceRecoveries: recoveryPlan.allocations,
        netPay: finalNetPay,
      },
    });
  } catch (error) {
    console.error("Error previewing Payroll:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Could not calculate Payroll preview",
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
      payDate,
      payFrequency,
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
      applyEmployeeAdvances = true,
      requestedAdvanceRecovery,
    } = req.body;

    if (!payPeriod || Number(grossPay || 0) <= 0 || !paidFromAccountNumber) {
      return res.status(400).json({
        success: false,
        message: "Pay period, valid gross pay, and payment account are required",
      });
    }

    let finalEmployeeId = "";
    let finalEmployeeName = String(employeeName || "").trim();
    let finalRole = String(role || "").trim();
    let finalPayFrequency = payFrequency || "Monthly";
    const finalGrossPay = roundMoney(grossPay);

    if (employeeId) {
      const employee = await HREmployee.findOne({ employeeId });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Selected employee not found",
        });
      }

      if (employee.employmentStatus !== "Active") {
        return res.status(400).json({
          success: false,
          message: "Payroll can only be created for an active employee",
        });
      }

      if (employee.payrollEnabled === false) {
        return res.status(400).json({
          success: false,
          message: "Payroll is disabled for the selected employee",
        });
      }

      finalEmployeeId = employee.employeeId;
      finalEmployeeName = employee.fullName;
      finalRole = employee.jobTitle;

      if (!payFrequency) {
        if (employee.payType === "Weekly Wage") finalPayFrequency = "Weekly";
        else finalPayFrequency = "Monthly";
      }
    }

        if (!finalEmployeeName || !finalRole) {
      return res.status(400).json({
        success: false,
        message: "Employee name and role are required",
      });
    }

    const duplicatePayroll = finalEmployeeId
      ? await Payroll.findOne({
          employeeId: finalEmployeeId,
          payPeriod,
          status: {
            $nin: ["Reversed", "Cancelled"],
          },
        })
      : null;

    if (duplicatePayroll) {
      return res.status(409).json({
        success: false,
        message:
          `${finalEmployeeName} already has Payroll ` +
          `${duplicatePayroll.payrollNumber} for ${payPeriod}`,
      });
    }

    const selectedFinancialAccount = await FinancialAccount.findOne({
      accountNumber: paidFromAccountNumber,
      status: "Active",
      accountType: { $in: ["Bank", "Cash"] },
    });

    if (!selectedFinancialAccount) {
      return res.status(404).json({
        success: false,
        message: "Select an active Bank or Cash account for Payroll payment",
      });
    }

    if (!selectedFinancialAccount.linkedChartAccountCode) {
      return res.status(400).json({
        success: false,
        message:
          "Selected Payroll payment account is not linked to a Chart of Accounts code.",
      });
    }

    const calculationDate = normalizePayrollDate(payDate || payPeriod);
    const automaticCalculation = await calculateJamaicanPayroll({
      grossPay: finalGrossPay,
      pensionEmployee: Number(pensionEmployee || 0),
      payPeriod,
      payDate: calculationDate,
      payFrequency: finalPayFrequency,
    });

    const autoCalculate =
      autoCalculateStatutoryDeductions === true ||
      autoCalculateStatutoryDeductions === "true" ||
      autoCalculateStatutoryDeductions === undefined;
    const hasDetailedManualDeductions =
      nisEmployee !== undefined ||
      nhtEmployee !== undefined ||
      educationTax !== undefined ||
      incomeTax !== undefined;

    let payrollBreakdown = { ...automaticCalculation };
    let calculationMode = "Automatic";

    if (!autoCalculate && hasDetailedManualDeductions) {
      payrollBreakdown.nisEmployee = Math.max(0, roundMoney(nisEmployee));
      payrollBreakdown.nhtEmployee = Math.max(0, roundMoney(nhtEmployee));
      payrollBreakdown.educationTax = Math.max(0, roundMoney(educationTax));
      payrollBreakdown.incomeTax = Math.max(0, roundMoney(incomeTax));
      payrollBreakdown.pensionEmployee = Math.max(
        0,
        roundMoney(pensionEmployee)
      );
      payrollBreakdown.totalDeductions = roundMoney(
        payrollBreakdown.nisEmployee +
          payrollBreakdown.nhtEmployee +
          payrollBreakdown.educationTax +
          payrollBreakdown.incomeTax +
          payrollBreakdown.pensionEmployee
      );
      payrollBreakdown.totalEmployeeDeductions =
        payrollBreakdown.totalDeductions;
      payrollBreakdown.netPay = roundMoney(
        finalGrossPay - payrollBreakdown.totalDeductions
      );
      calculationMode = "Manual";
    } else if (!autoCalculate && deductions !== undefined) {
      const safeDeductions = Math.max(0, roundMoney(deductions));
      payrollBreakdown.nisEmployee = 0;
      payrollBreakdown.nhtEmployee = 0;
      payrollBreakdown.educationTax = 0;
      payrollBreakdown.incomeTax = 0;
      payrollBreakdown.pensionEmployee = 0;
      payrollBreakdown.totalDeductions = safeDeductions;
      payrollBreakdown.totalEmployeeDeductions = safeDeductions;
      payrollBreakdown.netPay = roundMoney(finalGrossPay - safeDeductions);
      calculationMode = "Manual";
    }

        if (payrollBreakdown.netPay < 0) {
      return res.status(400).json({
        success: false,
        message: "Payroll deductions cannot exceed gross pay",
      });
    }

    const shouldApplyAdvances =
      applyEmployeeAdvances === true ||
      applyEmployeeAdvances === "true";

    const netPayBeforeAdvance = payrollBreakdown.netPay;

    const recoveryPlan = shouldApplyAdvances
      ? await buildEmployeeAdvanceRecoveryPlan({
          employeeId: finalEmployeeId,
          payPeriod,
          availableNetPay: netPayBeforeAdvance,
          requestedRecoveryAmount: requestedAdvanceRecovery,
        })
      : {
          totalAdvanceRecovery: 0,
          allocations: [],
        };

    payrollBreakdown.netPayBeforeAdvance = netPayBeforeAdvance;
    payrollBreakdown.advanceRecovery =
      recoveryPlan.totalAdvanceRecovery;
    payrollBreakdown.advanceRecoveries =
      recoveryPlan.allocations;

    payrollBreakdown.netPay = roundMoney(
      netPayBeforeAdvance - recoveryPlan.totalAdvanceRecovery
    );

    const newPayroll = await Payroll.create({
      payrollNumber: `PAY-${Date.now()}`,
      employeeId: finalEmployeeId,
      employeeName: finalEmployeeName,
      role: finalRole,
      payPeriod,
      payDate: calculationDate,
      payFrequency: finalPayFrequency,
      grossPay: payrollBreakdown.grossPay,
      statutoryIncome: payrollBreakdown.statutoryIncome,
      chargeableIncome: payrollBreakdown.chargeableIncome,
      nisInsurablePay: payrollBreakdown.nisInsurablePay,
      deductions: payrollBreakdown.totalDeductions,
      nisEmployee: payrollBreakdown.nisEmployee,
      nhtEmployee: payrollBreakdown.nhtEmployee,
      educationTax: payrollBreakdown.educationTax,
      incomeTax: payrollBreakdown.incomeTax,
      pensionEmployee: payrollBreakdown.pensionEmployee,
            totalDeductions: payrollBreakdown.totalDeductions,
      netPayBeforeAdvance: payrollBreakdown.netPayBeforeAdvance,
      advanceRecovery: payrollBreakdown.advanceRecovery,
      advanceRecoveries: payrollBreakdown.advanceRecoveries,
      netPay: payrollBreakdown.netPay,
      nisEmployer: payrollBreakdown.nisEmployer,
      nhtEmployer: payrollBreakdown.nhtEmployer,
      educationTaxEmployer: payrollBreakdown.educationTaxEmployer,
      heartEmployer: payrollBreakdown.heartEmployer,
      totalEmployerContributions:
        payrollBreakdown.totalEmployerContributions,
      totalPayrollCost: payrollBreakdown.totalPayrollCost,
      statutoryRuleId: payrollBreakdown.statutoryRuleId,
      statutoryRuleCode: payrollBreakdown.statutoryRuleCode,
      statutoryRuleEffectiveFrom:
        payrollBreakdown.statutoryRuleEffectiveFrom,
      statutoryRuleSnapshot: payrollBreakdown.statutoryRuleSnapshot,
      calculationMode,
      paidFromAccountNumber,
      paidFromAccountName: selectedFinancialAccount.accountName,
            status: "Pending",
      createdBy: getUserName(req.user),
    });

        try {
      if (req.user) {
        await writeAuditLog({
          req,
          action: "CREATE_PAYROLL_PENDING",
          module: "Payroll",
          description:
            `Pending Payroll ${newPayroll.payrollNumber} created ` +
            `for ${newPayroll.employeeName}`,
          targetType: "Payroll",
          targetId: newPayroll.payrollNumber,
          metadata: {
            employeeId: newPayroll.employeeId,
            employeeName: newPayroll.employeeName,
            payPeriod: newPayroll.payPeriod,
            grossPay: newPayroll.grossPay,
            totalEmployeeDeductions: newPayroll.totalDeductions,
            netPayBeforeAdvance: newPayroll.netPayBeforeAdvance,
            advanceRecovery: newPayroll.advanceRecovery,
            netPay: newPayroll.netPay,
            totalEmployerContributions:
              newPayroll.totalEmployerContributions,
            totalPayrollCost: newPayroll.totalPayrollCost,
            statutoryRuleCode: newPayroll.statutoryRuleCode,
            paidFromAccountNumber:
              newPayroll.paidFromAccountNumber,
            paidFromAccountName:
              newPayroll.paidFromAccountName,
            status: newPayroll.status,
          },
        });
      }
    } catch (auditError) {
      console.error(
        "Audit log error while creating pending Payroll:",
        auditError
      );
    }

    return res.status(201).json({
      success: true,
      message:
        "Payroll record created successfully and is pending approval",
      data: newPayroll,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create Payroll record",
      error: error.message,
    });
  }
};

const approvePayroll = async (req, res) => {
  try {
    const { payrollNumber } = req.params;
    const { approvalNotes = "" } = req.body;

    const payroll = await Payroll.findOne({ payrollNumber });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    if (payroll.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message:
          `Only Pending Payroll can be approved. ` +
          `Current status: ${payroll.status}`,
      });
    }

    payroll.status = "Approved";
    payroll.approvedBy = getUserName(req.user);
    payroll.approvedAt = new Date();
    payroll.approvalNotes = String(approvalNotes || "").trim();

    await payroll.save();

    try {
      await writeAuditLog({
        req,
        action: "APPROVE_PAYROLL",
        module: "Payroll",
        description:
          `Payroll ${payroll.payrollNumber} approved ` +
          `for ${payroll.employeeName}`,
        targetType: "Payroll",
        targetId: payroll.payrollNumber,
        metadata: {
          employeeId: payroll.employeeId,
          employeeName: payroll.employeeName,
          payPeriod: payroll.payPeriod,
          grossPay: payroll.grossPay,
          netPay: payroll.netPay,
          advanceRecovery: payroll.advanceRecovery,
          approvedBy: payroll.approvedBy,
          approvedAt: payroll.approvedAt,
        },
      });
    } catch (auditError) {
      console.error("Payroll approval audit error:", auditError);
    }

    return res.json({
      success: true,
      message: "Payroll approved successfully",
      data: payroll,
    });
  } catch (error) {
    console.error("Error approving Payroll:", error);

    return res.status(500).json({
      success: false,
      message: "Could not approve Payroll",
      error: error.message,
    });
  }
};

const payPayroll = async (req, res) => {
  try {
    const { payrollNumber } = req.params;

    const payroll = await Payroll.findOne({ payrollNumber });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    if (payroll.status !== "Approved") {
      return res.status(400).json({
        success: false,
        message:
          `Only Approved Payroll can be paid. ` +
          `Current status: ${payroll.status}`,
      });
    }

    if (payroll.journalEntryNumber) {
      return res.status(409).json({
        success: false,
        message:
          `Payroll ${payroll.payrollNumber} has already been posted`,
      });
    }

    const paymentAccount = await FinancialAccount.findOne({
      accountNumber: payroll.paidFromAccountNumber,
      status: "Active",
      accountType: {
        $in: ["Bank", "Cash"],
      },
    });

    if (!paymentAccount) {
      return res.status(404).json({
        success: false,
        message:
          "The selected Payroll payment account is unavailable",
      });
    }

    if (!paymentAccount.linkedChartAccountCode) {
      return res.status(400).json({
        success: false,
        message:
          "The Payroll payment account is not linked to the Chart of Accounts",
      });
    }

    if (
      Number(paymentAccount.currentBalance || 0) <
      Number(payroll.netPay || 0)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Insufficient balance in the Payroll payment account",
      });
    }

    const recoveryPlan =
      await buildEmployeeAdvanceRecoveryPlan({
        employeeId: payroll.employeeId,
        payPeriod: payroll.payPeriod,
        availableNetPay: payroll.netPayBeforeAdvance,
        requestedRecoveryAmount: payroll.advanceRecovery,
      });

    if (
      roundMoney(recoveryPlan.totalAdvanceRecovery) !==
      roundMoney(payroll.advanceRecovery)
    ) {
      return res.status(409).json({
        success: false,
        message:
          "The employee advance balance changed after this Payroll " +
          "was created. Cancel and recreate the Payroll.",
      });
    }

    const expectedAdvanceNumbers = (
      payroll.advanceRecoveries || []
    )
      .map((item) => item.advanceNumber)
      .sort()
      .join(",");

    const currentAdvanceNumbers = (
      recoveryPlan.allocations || []
    )
      .map((item) => item.advanceNumber)
      .sort()
      .join(",");

    if (expectedAdvanceNumbers !== currentAdvanceNumbers) {
      return res.status(409).json({
        success: false,
        message:
          "The employee advance allocation changed after approval. " +
          "Cancel and recreate the Payroll.",
      });
    }

    const journalEntry = await postPayrollPayment({
      paymentAccount,
      payroll,
      paymentDate: payroll.payDate,
      user: req.user,
    });

    const appliedAdvanceRecoveries =
      await applyEmployeeAdvanceRecoveries({
        allocations: recoveryPlan.allocations,
        payrollNumber: payroll.payrollNumber,
        payPeriod: payroll.payPeriod,
        journalEntryNumber: journalEntry.entryNumber,
        recoveredBy: getUserName(req.user),
      });

    const transaction = await AccountTransaction.create({
      transactionNumber: `TRN-${Date.now()}-PAY`,
      accountNumber: paymentAccount.accountNumber,
      accountName: paymentAccount.accountName,
      linkedChartAccountCode:
        paymentAccount.linkedChartAccountCode,
      journalEntryNumber: journalEntry.entryNumber,
      ledgerReference: journalEntry.entryNumber,
      transactionType: "Payroll Payment",
      amount: Number(payroll.netPay || 0),
      reference: payroll.payrollNumber,
      notes:
        `Payroll payment for ${payroll.employeeName} - ` +
        `${payroll.payPeriod}`,
      transactionDate: payroll.payDate || new Date(),
    });

    payroll.status = "Paid";
    payroll.journalEntryNumber = journalEntry.entryNumber;
    payroll.paidBy = getUserName(req.user);
    payroll.paidAt = new Date();

    await payroll.save();

    try {
      await writeAuditLog({
        req,
        action: "PAY_PAYROLL",
        module: "Payroll",
        description:
          `Payroll ${payroll.payrollNumber} paid ` +
          `for ${payroll.employeeName}`,
        targetType: "Payroll",
        targetId: payroll.payrollNumber,
        journalEntryNumber: journalEntry.entryNumber,
        accountNumber: paymentAccount.accountNumber,
        accountName: paymentAccount.accountName,
        metadata: {
          employeeId: payroll.employeeId,
          employeeName: payroll.employeeName,
          payPeriod: payroll.payPeriod,
          grossPay: payroll.grossPay,
          totalEmployeeDeductions:
            payroll.totalDeductions,
          netPayBeforeAdvance:
            payroll.netPayBeforeAdvance,
          advanceRecovery: payroll.advanceRecovery,
          advanceRecoveries: appliedAdvanceRecoveries,
          netPay: payroll.netPay,
          totalEmployerContributions:
            payroll.totalEmployerContributions,
          totalPayrollCost: payroll.totalPayrollCost,
          paidBy: payroll.paidBy,
          paidAt: payroll.paidAt,
          transactionNumber: transaction.transactionNumber,
        },
      });
    } catch (auditError) {
      console.error("Payroll payment audit error:", auditError);
    }

    return res.json({
      success: true,
      message: "Payroll paid and posted successfully",
      data: payroll,
      journalEntryNumber: journalEntry.entryNumber,
      transactionNumber: transaction.transactionNumber,
      advanceRecoveries: appliedAdvanceRecoveries,
    });
  } catch (error) {
    console.error("Error paying Payroll:", error);

    return res.status(500).json({
      success: false,
      message: "Could not pay Payroll",
      error: error.message,
    });
  }
};

const cancelPayroll = async (req, res) => {
  try {
    const { payrollNumber } = req.params;
    const { reason = "" } = req.body;

    if (!String(reason || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required",
      });
    }

    const payroll = await Payroll.findOne({ payrollNumber });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    if (!["Pending", "Approved"].includes(payroll.status)) {
      return res.status(400).json({
        success: false,
        message:
          "Only Pending or Approved Payroll can be cancelled",
      });
    }

    payroll.status = "Cancelled";
    payroll.cancelledBy = getUserName(req.user);
    payroll.cancelledAt = new Date();
    payroll.cancellationReason = String(reason).trim();

    await payroll.save();

    try {
      await writeAuditLog({
        req,
        action: "CANCEL_PAYROLL",
        module: "Payroll",
        description:
          `Payroll ${payroll.payrollNumber} cancelled`,
        targetType: "Payroll",
        targetId: payroll.payrollNumber,
        metadata: {
          employeeId: payroll.employeeId,
          employeeName: payroll.employeeName,
          payPeriod: payroll.payPeriod,
          cancelledBy: payroll.cancelledBy,
          cancelledAt: payroll.cancelledAt,
          reason: payroll.cancellationReason,
        },
      });
    } catch (auditError) {
      console.error("Payroll cancellation audit error:", auditError);
    }

    return res.json({
      success: true,
      message: "Payroll cancelled successfully",
      data: payroll,
    });
  } catch (error) {
    console.error("Error cancelling Payroll:", error);

    return res.status(500).json({
      success: false,
      message: "Could not cancel Payroll",
      error: error.message,
    });
  }
};

module.exports = {
  getPayroll,
  getMyPayroll,
  previewPayroll,
  createPayroll,
  approvePayroll,
  payPayroll,
  cancelPayroll,
};