const TaxRecord = require("../models/TaxRecord");
const Payroll = require("../models/Payroll");
const Expense = require("../models/Expense");
const Invoice = require("../models/Invoice");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");
const TaxDeadlineRule = require("../models/TaxDeadlineRule");
const TaxRegistrationProfile = require("../models/TaxRegistrationProfile");
const GctFilingPeriod = require("../models/GctFilingPeriod");

const {
  postTaxLiabilityPayment,
  postGctFilingSettlement,
} = require("../services/accountingService");

const {
  applyDeadlineRuleToRecord,
} = require("../services/taxDeadlineService");

const {
  generateGctTurnoverMonitor,
} = require("../services/gctMonitoringService");

const {
  generateGctFilingPeriod,
  getGctRegister,
} = require("../services/gctFilingService");

const ACTIVE_PAYROLL_STATUSES = ["Approved", "Paid"];
const PAY_PERIOD_PATTERN = /^\d{4}-\d{2}$/;

const TAX_WORKFLOW_ACTIONS = {
  Review: {
    fromStatus: "Calculated",
    toStatus: "Reviewed",
  },

  Approve: {
    fromStatus: "Reviewed",
    toStatus: "Approved",
  },

  Submit: {
    fromStatus: "Approved",
    toStatus: "Submitted",
  },
};

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getUserName = (user) =>
  user?.fullName || user?.name || user?.email || "System User";

const getPeriodDates = (payPeriod) => {
  if (!PAY_PERIOD_PATTERN.test(String(payPeriod || ""))) {
    throw new Error("Pay period must use YYYY-MM format.");
  }

  const [year, month] = String(payPeriod).split("-").map(Number);

  const periodStart = `${payPeriod}-01`;
  const periodEnd = new Date(Date.UTC(year, month, 0))
    .toISOString()
    .slice(0, 10);

  return {
    periodKey: payPeriod,
    periodStart,
    periodEnd,
  };
};

const getTaxCategory = (taxType) => {
  if (
    [
      "PAYE",
      "NIS",
      "NHT",
      "Education Tax",
      "HEART",
      "Pension",
    ].includes(taxType)
  ) {
    return "Payroll Statutory";
  }

  if (taxType === "GCT") {
    return "Consumption Tax";
  }

  if (
    [
      "Income Tax",
      "Individual Income Tax",
      "Company Tax",
      "Company Income Tax",
    ].includes(taxType)
  ) {
    return "Income Tax";
  }

  return "Other";
};

const getPayrollQuery = (payPeriod = "") => {
  const query = {
    status: {
      $in: ACTIVE_PAYROLL_STATUSES,
    },
  };

  if (payPeriod) {
    query.payPeriod = payPeriod;
  }

  return query;
};

const calculatePayrollLiabilities = (payrolls = []) => {
  const totals = payrolls.reduce(
    (sum, payroll) => {
      sum.grossPay += Number(payroll.grossPay || 0);

      sum.nisEmployee += Number(payroll.nisEmployee || 0);
      sum.nisEmployer += Number(payroll.nisEmployer || 0);

      sum.nhtEmployee += Number(payroll.nhtEmployee || 0);
      sum.nhtEmployer += Number(payroll.nhtEmployer || 0);

      sum.educationTaxEmployee += Number(payroll.educationTax || 0);
      sum.educationTaxEmployer += Number(
        payroll.educationTaxEmployer || 0
      );

      sum.paye += Number(payroll.incomeTax || 0);
      sum.heartEmployer += Number(payroll.heartEmployer || 0);

      sum.pensionEmployee += Number(payroll.pensionEmployee || 0);
      sum.pensionEmployer += Number(payroll.pensionEmployer || 0);

      sum.totalEmployeeDeductions += Number(
        payroll.totalDeductions || 0
      );

      sum.totalEmployerContributions += Number(
        payroll.totalEmployerContributions || 0
      );

      sum.netPayBeforeAdvance += Number(
        payroll.netPayBeforeAdvance ??
          Number(payroll.grossPay || 0) -
            Number(payroll.totalDeductions || 0)
      );

      sum.advanceRecovery += Number(payroll.advanceRecovery || 0);
      sum.netPay += Number(payroll.netPay || 0);
      sum.totalPayrollCost += Number(
        payroll.totalPayrollCost ||
          Number(payroll.grossPay || 0) +
            Number(payroll.totalEmployerContributions || 0)
      );

      return sum;
    },
    {
      grossPay: 0,

      nisEmployee: 0,
      nisEmployer: 0,

      nhtEmployee: 0,
      nhtEmployer: 0,

      educationTaxEmployee: 0,
      educationTaxEmployer: 0,

      paye: 0,
      heartEmployer: 0,

      pensionEmployee: 0,
      pensionEmployer: 0,

      totalEmployeeDeductions: 0,
      totalEmployerContributions: 0,

      netPayBeforeAdvance: 0,
      advanceRecovery: 0,
      netPay: 0,
      totalPayrollCost: 0,
    }
  );

  Object.keys(totals).forEach((key) => {
    totals[key] = roundMoney(totals[key]);
  });

  totals.nisPayable = roundMoney(
    totals.nisEmployee + totals.nisEmployer
  );

  totals.nhtPayable = roundMoney(
    totals.nhtEmployee + totals.nhtEmployer
  );

  totals.educationTaxPayable = roundMoney(
    totals.educationTaxEmployee +
      totals.educationTaxEmployer
  );

  totals.payePayable = roundMoney(totals.paye);

  totals.heartPayable = roundMoney(totals.heartEmployer);

  totals.pensionPayable = roundMoney(
    totals.pensionEmployee + totals.pensionEmployer
  );

  totals.totalGovernmentLiability = roundMoney(
    totals.nisPayable +
      totals.nhtPayable +
      totals.educationTaxPayable +
      totals.payePayable +
      totals.heartPayable +
      totals.pensionPayable
  );

  return totals;
};

const buildLiabilityBreakdown = ({
  taxType,
  employeePortion,
  employerPortion,
}) => {
  const breakdown = {
    paye: 0,

    nisEmployee: 0,
    nisEmployer: 0,

    nhtEmployee: 0,
    nhtEmployer: 0,

    educationTaxEmployee: 0,
    educationTaxEmployer: 0,

    heartEmployer: 0,

    pensionEmployee: 0,
    pensionEmployer: 0,

    gctOutputTax: 0,
    gctInputTaxCredit: 0,

    individualIncomeTax: 0,
    companyIncomeTax: 0,

    otherAmount: 0,
  };

  if (taxType === "NIS") {
    breakdown.nisEmployee = employeePortion;
    breakdown.nisEmployer = employerPortion;
  }

  if (taxType === "NHT") {
    breakdown.nhtEmployee = employeePortion;
    breakdown.nhtEmployer = employerPortion;
  }

  if (taxType === "Education Tax") {
    breakdown.educationTaxEmployee = employeePortion;
    breakdown.educationTaxEmployer = employerPortion;
  }

  if (taxType === "PAYE") {
    breakdown.paye = employeePortion;
  }

  if (taxType === "HEART") {
    breakdown.heartEmployer = employerPortion;
  }

  if (taxType === "Pension") {
    breakdown.pensionEmployee = employeePortion;
    breakdown.pensionEmployer = employerPortion;
  }

  return breakdown;
};

const getTaxRecords = async (req, res) => {
  try {
    const {
      taxType = "",
      taxCategory = "",
      status = "",
      periodKey = "",
      sourceType = "",
    } = req.query;

    const query = {};

    if (taxType) query.taxType = taxType;
    if (taxCategory) query.taxCategory = taxCategory;
    if (status) query.status = status;
    if (periodKey) query.periodKey = periodKey;
    if (sourceType) query.sourceType = sourceType;

    const records = await TaxRecord.find(query).sort({
      periodStart: -1,
      taxType: 1,
      createdAt: -1,
    });

    const summary = records.reduce(
      (sum, item) => {
        sum.totalTaxDue += Number(item.taxDue || 0);
        sum.totalPaid += Number(item.amountPaid || 0);
        sum.totalBalance += Number(item.balanceDue || 0);

        if (
          item.status !== "Paid" &&
          item.status !== "Reconciled" &&
          item.status !== "Cancelled"
        ) {
          sum.openRecords += 1;
        }

        return sum;
      },
      {
        totalRecords: records.length,
        openRecords: 0,
        totalTaxDue: 0,
        totalPaid: 0,
        totalBalance: 0,
      }
    );

    summary.totalTaxDue = roundMoney(summary.totalTaxDue);
    summary.totalPaid = roundMoney(summary.totalPaid);
    summary.totalBalance = roundMoney(summary.totalBalance);

    res.json({
      success: true,
      summary,
      data: records,
    });
  } catch (error) {
    console.error("Tax records error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve tax records",
      error: error.message,
    });
  }
};

const createTaxRecord = async (req, res) => {
  try {
    const {
      taxType,
      periodStart,
      periodEnd,
      taxableAmount,
      taxRate,
      taxDue: suppliedTaxDue,
      dueDate,
      notes,
    } = req.body;

    if (!taxType || !periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        message:
          "Tax type, period start and period end are required.",
      });
    }

    if (periodStart > periodEnd) {
      return res.status(400).json({
        success: false,
        message:
          "Period start cannot be later than period end.",
      });
    }

    const calculatedTaxDue =
      suppliedTaxDue !== undefined &&
      suppliedTaxDue !== null &&
      suppliedTaxDue !== ""
        ? roundMoney(suppliedTaxDue)
        : roundMoney(
            Number(taxableAmount || 0) *
              (Number(taxRate || 0) / 100)
          );

    const record = await TaxRecord.create({
      taxNumber: `TAX-${Date.now()}`,
      taxType,
      taxCategory: getTaxCategory(taxType),
      periodKey: String(periodStart).slice(0, 7),
      periodStart,
      periodEnd,
      filingFrequency: "Monthly",
      sourceType: "Manual",
      sourceModule: "Tax Center",
      taxableAmount: roundMoney(taxableAmount),
      taxRate: Number(taxRate || 0),
      taxDue: calculatedTaxDue,
      amountPaid: 0,
      balanceDue: calculatedTaxDue,
      dueDate: dueDate || "",
      status: "Draft",
      notes: notes || "",
      createdBy: getUserName(req.user),
      updatedBy: getUserName(req.user),
    });

    res.status(201).json({
      success: true,
      message: "Tax record created successfully",
      data: record,
    });
  } catch (error) {
    console.error("Tax record creation error:", error);

    res.status(500).json({
      success: false,
      message: "Could not create tax record",
      error: error.message,
    });
  }
};

const generatePayrollTaxSummary = async (req, res) => {
  try {
    const payPeriod = String(req.query.payPeriod || "").trim();

    if (payPeriod && !PAY_PERIOD_PATTERN.test(payPeriod)) {
      return res.status(400).json({
        success: false,
        message: "Pay period must use YYYY-MM format.",
      });
    }

    const payrolls = await Payroll.find(
      getPayrollQuery(payPeriod)
    ).sort({
      payPeriod: 1,
      employeeName: 1,
    });

    const summary = calculatePayrollLiabilities(payrolls);

    const periodQuery = {
      sourceType: "Payroll",
      taxCategory: "Payroll Statutory",
      status: {
        $ne: "Cancelled",
      },
    };

    if (payPeriod) {
      periodQuery.periodKey = payPeriod;
    }

    const taxRecords = await TaxRecord.find(periodQuery);

    const recordedLiability = roundMoney(
      taxRecords.reduce(
        (sum, record) => sum + Number(record.taxDue || 0),
        0
      )
    );

    const amountPaid = roundMoney(
      taxRecords.reduce(
        (sum, record) => sum + Number(record.amountPaid || 0),
        0
      )
    );

    const balanceDue = roundMoney(
      taxRecords.reduce(
        (sum, record) => sum + Number(record.balanceDue || 0),
        0
      )
    );

    const reconciliationDifference = roundMoney(
      summary.totalGovernmentLiability - recordedLiability
    );

    res.json({
      success: true,
      message:
        "Payroll statutory summary generated successfully",
      filters: {
        payPeriod,
        payrollStatuses: ACTIVE_PAYROLL_STATUSES,
      },
      data: {
        ...summary,
        payrollRecordCount: payrolls.length,
        payrollNumbers: payrolls.map(
          (payroll) => payroll.payrollNumber
        ),
        taxCenterRecordedLiability: recordedLiability,
        taxCenterAmountPaid: amountPaid,
        taxCenterBalanceDue: balanceDue,
        reconciliationDifference,
        reconciled:
          payrolls.length > 0 &&
          reconciliationDifference === 0,
      },
    });
  } catch (error) {
    console.error("Payroll tax summary error:", error);

    res.status(500).json({
      success: false,
      message: "Could not generate payroll tax summary",
      error: error.message,
    });
  }
};

const generatePayrollLiabilities = async (req, res) => {
  try {
    const payPeriod = String(
      req.body.payPeriod || ""
    ).trim();

    if (!PAY_PERIOD_PATTERN.test(payPeriod)) {
      return res.status(400).json({
        success: false,
        message: "Pay period must use YYYY-MM format.",
      });
    }

    const payrolls = await Payroll.find(
      getPayrollQuery(payPeriod)
    ).sort({
      employeeName: 1,
      payrollNumber: 1,
    });

    if (payrolls.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          `No Approved or Paid payroll records were found for ${payPeriod}.`,
      });
    }

    const existingRecords = await TaxRecord.find({
      sourceType: "Payroll",
      sourceReference: `PAYROLL-${payPeriod}`,
      status: {
        $ne: "Cancelled",
      },
    });

    if (existingRecords.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          `Payroll statutory liabilities have already been generated for ${payPeriod}.`,
        data: existingRecords,
      });
    }

    const period = getPeriodDates(payPeriod);
    const totals = calculatePayrollLiabilities(payrolls);

    const payrollNumbers = payrolls.map(
      (payroll) => payroll.payrollNumber
    );

    const ruleCodes = [
      ...new Set(
        payrolls
          .map((payroll) => payroll.statutoryRuleCode)
          .filter(Boolean)
      ),
    ];

    const calculationRuleCode =
      ruleCodes.length === 1
        ? ruleCodes[0]
        : ruleCodes.length > 1
          ? "MULTIPLE-RULES"
          : "";

    const commonRecord = {
      taxCategory: "Payroll Statutory",
      businessType: "Sole Proprietorship",
      businessName: "Eltham Konnect",

      periodKey: period.periodKey,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      filingFrequency: "Monthly",

      sourceType: "Payroll",
      sourceModule: "Payroll",
      sourceReference: `PAYROLL-${payPeriod}`,

      payrollNumbers,
      payrollRecordCount: payrolls.length,

      taxableAmount: totals.grossPay,
      taxRate: 0,

      amountPaid: 0,
      adjustmentAmount: 0,
      penaltyAmount: 0,
      interestAmount: 0,

      calculationRuleCode,

      calculationSnapshot: {
        payPeriod,
        generatedAt: new Date(),
        payrollStatuses: ACTIVE_PAYROLL_STATUSES,
        payrollNumbers,
        ruleCodes,
        totals,
      },

      status: "Calculated",
      notes:
        `Generated from ${payrolls.length} Approved or Paid payroll record(s) for ${payPeriod}.`,

      createdBy: getUserName(req.user),
      updatedBy: getUserName(req.user),
    };

    const definitions = [
      {
        taxType: "NIS",
        employeePortion: totals.nisEmployee,
        employerPortion: totals.nisEmployer,
      },
      {
        taxType: "NHT",
        employeePortion: totals.nhtEmployee,
        employerPortion: totals.nhtEmployer,
      },
      {
        taxType: "Education Tax",
        employeePortion: totals.educationTaxEmployee,
        employerPortion: totals.educationTaxEmployer,
      },
      {
        taxType: "PAYE",
        employeePortion: totals.paye,
        employerPortion: 0,
      },
      {
        taxType: "HEART",
        employeePortion: 0,
        employerPortion: totals.heartEmployer,
      },
      {
        taxType: "Pension",
        employeePortion: totals.pensionEmployee,
        employerPortion: totals.pensionEmployer,
      },
    ];

    const timestamp = Date.now();

    const recordsToCreate = definitions.map(
      (definition, index) => {
        const employeePortion = roundMoney(
          definition.employeePortion
        );

        const employerPortion = roundMoney(
          definition.employerPortion
        );

        const taxDue = roundMoney(
          employeePortion + employerPortion
        );

        return {
          ...commonRecord,

          taxNumber:
            `TAX-PAY-${payPeriod.replace("-", "")}-` +
            `${String(index + 1).padStart(2, "0")}-${timestamp}`,

          taxType: definition.taxType,
          employeePortion,
          employerPortion,
          taxDue,
          balanceDue: taxDue,

          liabilityBreakdown: buildLiabilityBreakdown({
            taxType: definition.taxType,
            employeePortion,
            employerPortion,
          }),
        };
      }
    );

    const createdRecords = await TaxRecord.insertMany(
      recordsToCreate
    );

    res.status(201).json({
      success: true,
      message:
        `Payroll statutory liabilities generated successfully for ${payPeriod}.`,
      summary: {
        payPeriod,
        payrollRecordCount: payrolls.length,
        liabilityRecordCount: createdRecords.length,
        totals,
      },
      data: createdRecords,
    });
  } catch (error) {
    console.error(
      "Payroll liability generation error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not generate payroll statutory liabilities",
      error: error.message,
    });
  }
};

const transitionTaxRecordWorkflow = async (req, res) => {
  try {
    const {
      action,
      taxNumbers = [],
      periodKey = "",
      sourceType = "",
      notes = "",
      filingReference = "",
      filingMethod = "",
      filedDate = "",
    } = req.body;

    const workflowAction =
      TAX_WORKFLOW_ACTIONS[String(action || "").trim()];

    if (!workflowAction) {
      return res.status(400).json({
        success: false,
        message:
          "Action must be Review, Approve, or Submit.",
      });
    }

    const normalizedTaxNumbers = Array.isArray(taxNumbers)
      ? taxNumbers
          .map((taxNumber) =>
            String(taxNumber || "").trim()
          )
          .filter(Boolean)
      : [];

    const query = {
      status: {
        $ne: "Cancelled",
      },
    };

    if (normalizedTaxNumbers.length > 0) {
      query.taxNumber = {
        $in: normalizedTaxNumbers,
      };
    } else {
      if (!periodKey) {
        return res.status(400).json({
          success: false,
          message:
            "Provide taxNumbers or a periodKey.",
        });
      }

      query.periodKey = String(periodKey).trim();

      if (sourceType) {
        query.sourceType = String(sourceType).trim();
      }
    }

    const records = await TaxRecord.find(query).sort({
      taxType: 1,
      createdAt: 1,
    });

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "No matching Tax Center records were found.",
      });
    }

    if (
      normalizedTaxNumbers.length > 0 &&
      records.length !==
        new Set(normalizedTaxNumbers).size
    ) {
      return res.status(404).json({
        success: false,
        message:
          "One or more selected tax records were not found.",
      });
    }

    const invalidRecords = records.filter(
      (record) =>
        record.status !== workflowAction.fromStatus
    );

    if (invalidRecords.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          `${action} requires every selected record to have ` +
          `${workflowAction.fromStatus} status.`,
        invalidRecords: invalidRecords.map((record) => ({
          taxNumber: record.taxNumber,
          taxType: record.taxType,
          currentStatus: record.status,
          requiredStatus: workflowAction.fromStatus,
        })),
      });
    }

    if (
      action === "Submit" &&
      !String(filingReference || "").trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A filing or submission reference is required.",
      });
    }

    const performedBy = getUserName(req.user);
    const performedAt = new Date();

    for (const record of records) {
      const previousStatus = record.status;

      record.status = workflowAction.toStatus;
      record.updatedBy = performedBy;

      if (action === "Review") {
        record.reviewedBy = performedBy;
        record.reviewedAt = performedAt;
        record.reviewNotes = String(notes || "").trim();
      }

      if (action === "Approve") {
        record.approvedBy = performedBy;
        record.approvedAt = performedAt;
        record.approvalNotes = String(notes || "").trim();
      }

      if (action === "Submit") {
        record.submittedBy = performedBy;
        record.submittedAt = performedAt;
        record.submissionNotes = String(notes || "").trim();

        record.filingReference = String(
          filingReference || ""
        ).trim();

        record.filingMethod =
          String(filingMethod || "").trim() ||
          "TAJ Online";

        record.filedDate =
          String(filedDate || "").trim() ||
          performedAt.toISOString().slice(0, 10);
      }

      record.workflowHistory.push({
        fromStatus: previousStatus,
        toStatus: workflowAction.toStatus,
        action,
        notes: String(notes || "").trim(),
        performedBy,
        performedAt,
      });

      await record.save();
    }

    res.json({
      success: true,
      message:
        `${records.length} tax record(s) moved from ` +
        `${workflowAction.fromStatus} to ` +
        `${workflowAction.toStatus}.`,
      data: records,
    });
  } catch (error) {
    console.error(
      "Tax workflow transition error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not update the Tax Center workflow",
      error: error.message,
    });
  }
};

const payTaxRecord = async (req, res) => {
  try {
    const { taxNumber } = req.params;

    const {
      amount,
      paymentAccountNumber,
      paymentDate,
      paymentMethod = "",
      paymentReference,
      receiptUrl = "",
      notes = "",
    } = req.body;

    if (!taxNumber) {
      return res.status(400).json({
        success: false,
        message: "Tax number is required.",
      });
    }

    if (!paymentAccountNumber) {
      return res.status(400).json({
        success: false,
        message:
          "A payment account is required.",
      });
    }

    if (!paymentReference) {
      return res.status(400).json({
        success: false,
        message:
          "A payment confirmation or reference is required.",
      });
    }

    const paymentAmount = roundMoney(amount);

    if (paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "Payment amount must be greater than zero.",
      });
    }

    const record = await TaxRecord.findOne({
      taxNumber,
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Tax record not found.",
      });
    }

    const payableStatuses = [
      "Submitted",
      "Partially Paid",
      "Overdue",
    ];

    if (!payableStatuses.includes(record.status)) {
      return res.status(409).json({
        success: false,
        message:
          `${record.taxType} ${record.taxNumber} cannot be paid ` +
          `while its status is ${record.status}. ` +
          "It must be Submitted first.",
      });
    }

    const outstandingBalance = roundMoney(
      record.balanceDue
    );

    if (outstandingBalance <= 0) {
      return res.status(409).json({
        success: false,
        message:
          "This tax obligation has no outstanding balance.",
      });
    }

    if (paymentAmount > outstandingBalance) {
      return res.status(400).json({
        success: false,
        message:
          `Payment cannot exceed the outstanding balance of ` +
          `JMD ${outstandingBalance.toFixed(2)}.`,
      });
    }

    const duplicateReference = await TaxRecord.findOne({
      "remittances.paymentReference":
        String(paymentReference).trim(),
    });

    if (duplicateReference) {
      return res.status(409).json({
        success: false,
        message:
          "That tax payment reference has already been recorded.",
      });
    }

    const paymentAccount =
      await FinancialAccount.findOne({
        accountNumber: paymentAccountNumber,
        status: "Active",
      });

    if (!paymentAccount) {
      return res.status(404).json({
        success: false,
        message:
          "Active payment account not found.",
      });
    }

    if (!paymentAccount.linkedChartAccountCode) {
      return res.status(400).json({
        success: false,
        message:
          `${paymentAccount.accountName} is not linked to the Chart of Accounts.`,
      });
    }

    if (
      paymentAccount.accountType !== "Credit Card" &&
      roundMoney(paymentAccount.currentBalance) <
        paymentAmount
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The selected payment account has insufficient funds.",
      });
    }

    const normalizedPaymentDate =
      String(paymentDate || "").trim() ||
      new Date().toISOString().slice(0, 10);

    const journalEntry =
      await postTaxLiabilityPayment({
        taxRecord: record,
        paymentAccount,
        amount: paymentAmount,
        paymentDate: normalizedPaymentDate,
        paymentReference:
          String(paymentReference).trim(),
        user: req.user,
      });

    const remittanceNumber =
      `TAXPAY-${Date.now()}`;

    const accountTransaction =
      await AccountTransaction.create({
        transactionNumber:
          `TRN-${Date.now()}-TAX`,

        accountNumber:
          paymentAccount.accountNumber,

        accountName:
          paymentAccount.accountName,

        linkedChartAccountCode:
          paymentAccount.linkedChartAccountCode,

        journalEntryNumber:
          journalEntry.entryNumber,

        ledgerReference:
          journalEntry.entryNumber,

        transactionType: "Tax Payment",

        amount: paymentAmount,

        paymentMethod:
          String(paymentMethod || "").trim(),

        reference:
          String(paymentReference).trim(),

        notes:
          String(notes || "").trim() ||
          `${record.taxType} payment for ${record.periodKey}`,

        transactionDate:
          new Date(
            `${normalizedPaymentDate}T12:00:00.000Z`
          ),

        taxNumber: record.taxNumber,
        taxType: record.taxType,
        taxPeriodKey: record.periodKey,
      });

    const performedBy = getUserName(req.user);
    const previousStatus = record.status;

    record.amountPaid = roundMoney(
      Number(record.amountPaid || 0) +
        paymentAmount
    );

    record.balanceDue = roundMoney(
      Number(record.taxDue || 0) -
        record.amountPaid
    );

    record.status =
      record.balanceDue === 0
        ? "Paid"
        : "Partially Paid";

    record.journalEntryNumber =
      journalEntry.entryNumber;

    record.updatedBy = performedBy;

    record.remittances.push({
      remittanceNumber,
      paymentDate: normalizedPaymentDate,
      amount: paymentAmount,
      paymentMethod:
        String(paymentMethod || "").trim(),
      paymentReference:
        String(paymentReference).trim(),

      paymentAccountNumber:
        paymentAccount.accountNumber,

      paymentAccountName:
        paymentAccount.accountName,

      journalEntryNumber:
        journalEntry.entryNumber,

      receiptUrl:
        String(receiptUrl || "").trim(),

      notes:
        String(notes || "").trim(),

      recordedBy: performedBy,
      recordedAt: new Date(),
    });

    record.workflowHistory.push({
      fromStatus: previousStatus,
      toStatus: record.status,
      action: "Payment",
      notes:
        `${remittanceNumber} - JMD ` +
        `${paymentAmount.toFixed(2)} paid from ` +
        `${paymentAccount.accountName}.`,
      performedBy,
      performedAt: new Date(),
    });

    await record.save();

    res.status(201).json({
      success: true,
      message:
        `${record.taxType} payment recorded successfully.`,
      data: {
        taxRecord: record,
        remittanceNumber,
        journalEntryNumber:
          journalEntry.entryNumber,
        transactionNumber:
          accountTransaction.transactionNumber,
        paymentAccount: {
          accountNumber:
            paymentAccount.accountNumber,
          accountName:
            paymentAccount.accountName,
        },
      },
    });
  } catch (error) {
    console.error("Tax payment error:", error);

    res.status(500).json({
      success: false,
      message:
        "Could not process the tax payment",
      error: error.message,
    });
  }
};

const getTaxDeadlineRules = async (req, res) => {
  try {
    const {
      taxType = "",
      businessType = "",
      status = "",
    } = req.query;

    const query = {};

    if (taxType) query.taxType = taxType;
    if (businessType) query.businessType = businessType;
    if (status) query.status = status;

    const rules = await TaxDeadlineRule.find(query).sort({
      taxType: 1,
      businessType: 1,
      effectiveFrom: -1,
    });

    res.json({
      success: true,
      message:
        "Tax deadline rules retrieved successfully",
      totalRecords: rules.length,
      data: rules,
    });
  } catch (error) {
    console.error(
      "Get tax deadline rules error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not retrieve tax deadline rules",
      error: error.message,
    });
  }
};

const createTaxDeadlineRule = async (req, res) => {
  try {
    const {
      ruleCode,
      name,
      taxType,
      businessType = "All",
      filingFrequency,
      filingForm = "",
      effectiveFrom,
      effectiveTo = null,
      dueDateRule = {},
      reminderDays = [30, 14, 7, 3, 1],
      sourceName = "",
      sourceUrl = "",
      sourceReference = "",
      sourceVerifiedAt = null,
      notes = "",
    } = req.body;

    if (
      !ruleCode ||
      !name ||
      !taxType ||
      !filingFrequency ||
      !effectiveFrom
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Rule code, name, tax type, filing frequency and effective-from date are required.",
      });
    }

    const existingRule =
      await TaxDeadlineRule.findOne({
        ruleCode: String(ruleCode).trim(),
      });

    if (existingRule) {
      return res.status(409).json({
        success: false,
        message:
          `Deadline rule ${ruleCode} already exists.`,
      });
    }

    const performedBy = getUserName(req.user);

    const rule = await TaxDeadlineRule.create({
      ruleCode: String(ruleCode).trim(),
      name: String(name).trim(),
      countryCode: "JM",
      taxType,
      businessType,
      filingFrequency,
      filingForm: String(filingForm).trim(),
      effectiveFrom,
      effectiveTo,
      dueDateRule,
      reminderDays,
      sourceName: String(sourceName).trim(),
      sourceUrl: String(sourceUrl).trim(),
      sourceReference:
        String(sourceReference).trim(),
      sourceVerifiedAt,
      notes: String(notes).trim(),
      status: "Draft",
      createdBy: performedBy,
      updatedBy: performedBy,
    });

    res.status(201).json({
      success: true,
      message:
        "Draft tax deadline rule created successfully",
      data: rule,
    });
  } catch (error) {
    console.error(
      "Create tax deadline rule error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not create tax deadline rule",
      error: error.message,
    });
  }
};

const activateTaxDeadlineRule = async (
  req,
  res
) => {
  try {
    const { ruleCode } = req.params;

    const rule = await TaxDeadlineRule.findOne({
      ruleCode,
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Tax deadline rule not found.",
      });
    }

    if (rule.status === "Active") {
      return res.status(409).json({
        success: false,
        message:
          `${rule.ruleCode} is already active.`,
      });
    }

    if (
      !rule.sourceName ||
      (!rule.sourceUrl &&
        !rule.sourceReference) ||
      !rule.sourceVerifiedAt
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A rule cannot be activated until its source name, source URL or reference, and verification date are recorded.",
      });
    }

    const overlappingRule =
      await TaxDeadlineRule.findOne({
        _id: {
          $ne: rule._id,
        },

        countryCode: rule.countryCode,
        taxType: rule.taxType,
        businessType: rule.businessType,
        filingFrequency: rule.filingFrequency,
        status: "Active",

        effectiveFrom: {
          $lte:
            rule.effectiveTo ||
            new Date("9999-12-31T23:59:59.999Z"),
        },

        $or: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              $gte: rule.effectiveFrom,
            },
          },
        ],
      });

    if (overlappingRule) {
      return res.status(409).json({
        success: false,
        message:
          `${rule.ruleCode} overlaps active rule ${overlappingRule.ruleCode}.`,
      });
    }

    rule.status = "Active";
    rule.updatedBy = getUserName(req.user);

    await rule.save();

    res.json({
      success: true,
      message:
        `${rule.ruleCode} activated successfully.`,
      data: rule,
    });
  } catch (error) {
    console.error(
      "Activate tax deadline rule error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not activate tax deadline rule",
      error: error.message,
    });
  }
};

const applyTaxDeadlines = async (req, res) => {
  try {
    const {
      periodKey,
      sourceType = "",
    } = req.body;

    if (!periodKey) {
      return res.status(400).json({
        success: false,
        message: "Period key is required.",
      });
    }

    const query = {
      periodKey: String(periodKey).trim(),
      status: {
        $ne: "Cancelled",
      },
    };

    if (sourceType) {
      query.sourceType =
        String(sourceType).trim();
    }

    const records = await TaxRecord.find(query).sort({
      taxType: 1,
    });

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "No matching Tax Center records were found.",
      });
    }

    const updatedRecords = [];
    const failedRecords = [];
    const today =
      new Date().toISOString().slice(0, 10);
    const performedBy = getUserName(req.user);

    for (const record of records) {
      try {
        await applyDeadlineRuleToRecord(record);

        if (
          record.dueDate &&
          record.dueDate < today &&
          Number(record.balanceDue || 0) > 0 &&
          ![
            "Paid",
            "Reconciled",
            "Cancelled",
          ].includes(record.status)
        ) {
          const previousStatus = record.status;

          record.status = "Overdue";

          record.workflowHistory.push({
            fromStatus: previousStatus,
            toStatus: "Overdue",
            action: "Deadline Assessment",
            notes:
              `Outstanding obligation became overdue on ${record.dueDate}.`,
            performedBy,
            performedAt: new Date(),
          });
        }

        record.updatedBy = performedBy;
        await record.save();

        updatedRecords.push(record);
      } catch (error) {
        failedRecords.push({
          taxNumber: record.taxNumber,
          taxType: record.taxType,
          message: error.message,
        });
      }
    }

    res.status(
      failedRecords.length > 0 ? 207 : 200
    ).json({
      success: failedRecords.length === 0,

      message:
        failedRecords.length === 0
          ? "Tax deadlines applied successfully."
          : "Tax deadline application completed with missing or invalid rules.",

      summary: {
        requestedRecords: records.length,
        updatedRecords: updatedRecords.length,
        failedRecords: failedRecords.length,
      },

      data: updatedRecords,
      errors: failedRecords,
    });
  } catch (error) {
    console.error(
      "Apply tax deadlines error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not apply Tax Center deadlines",
      error: error.message,
    });
  }
};

const transitionGctFilingWorkflow = async (
  req,
  res
) => {
  try {
    const { filingNumber } = req.params;

    const {
      action,
      notes = "",
      filingReference = "",
      filingMethod = "TAJ Online",
      filedDate = "",
    } = req.body;

    const workflowActions = {
      Review: {
        fromStatus: "Calculated",
        toStatus: "Reviewed",
      },

      Approve: {
        fromStatus: "Reviewed",
        toStatus: "Approved",
      },

      Submit: {
        fromStatus: "Approved",
        toStatus: "Submitted",
      },
    };

    const workflowAction =
      workflowActions[
        String(action || "").trim()
      ];

    if (!workflowAction) {
      return res.status(400).json({
        success: false,
        message:
          "Action must be Review, Approve, or Submit.",
      });
    }

    const filingPeriod =
      await GctFilingPeriod.findOne({
        filingNumber,
      });

    if (!filingPeriod) {
      return res.status(404).json({
        success: false,
        message:
          "GCT filing period not found.",
      });
    }

    if (
      filingPeriod.calculationMode !==
        "Compliance" ||
      filingPeriod.registrationStatus !==
        "Registered" ||
      !filingPeriod.canFileReturn
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This is a Preview-only GCT period. A return cannot enter the compliance workflow unless an effective Registered profile applies.",
      });
    }

    if (
      filingPeriod.status !==
      workflowAction.fromStatus
    ) {
      return res.status(409).json({
        success: false,
        message:
          `${action} requires ${workflowAction.fromStatus} status. ` +
          `The current status is ${filingPeriod.status}.`,
      });
    }

    if (action === "Review") {
      if (
        Number(
          filingPeriod.unreviewedInvoiceCount ||
            0
        ) > 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            `${filingPeriod.unreviewedInvoiceCount} invoice classification(s) still require review.`,
        });
      }

      if (
        Number(
          filingPeriod.inputGctSummary
            ?.pendingVerificationInputGct ||
            0
        ) > 0
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Input GCT remains pending supplier-document verification.",
        });
      }
    }

    if (
      action === "Submit" &&
      !String(filingReference).trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A GCT filing or submission reference is required.",
      });
    }

    const performedBy =
      getUserName(req.user);

    const performedAt = new Date();
    const previousStatus =
      filingPeriod.status;

    let settlementJournal = null;
    let taxRecord = null;

    if (action === "Submit") {
      filingPeriod.filingReference =
        String(filingReference).trim();

      filingPeriod.filingMethod =
        String(filingMethod || "").trim() ||
        "TAJ Online";

      filingPeriod.filedDate =
        String(filedDate || "").trim() ||
        performedAt
          .toISOString()
          .slice(0, 10);

      filingPeriod.submittedBy =
        performedBy;

      filingPeriod.submittedAt =
        performedAt;

      if (
        !filingPeriod
          .settlementJournalEntryNumber
      ) {
        settlementJournal =
          await postGctFilingSettlement({
            filingPeriod,
            postingDate:
              filingPeriod.filedDate,
            user: req.user,
          });

        if (settlementJournal) {
          filingPeriod.settlementJournalEntryNumber =
            settlementJournal.entryNumber;

          filingPeriod.settlementPostedAt =
            performedAt;

          filingPeriod.settlementPostedBy =
            performedBy;
        }
      }

      if (Number(filingPeriod.netGct || 0) > 0) {
        taxRecord =
          await TaxRecord.findOne({
            sourceType: "GCT Return",
            sourceReference:
              filingPeriod.filingNumber,
            status: {
              $ne: "Cancelled",
            },
          });

        if (!taxRecord) {
          const netGct =
            roundMoney(
              filingPeriod.netGct
            );

          taxRecord =
            await TaxRecord.create({
              taxNumber:
                `TAX-GCT-${filingPeriod.periodKey.replace(
                  "-",
                  ""
                )}-${Date.now()}`,

              taxType: "GCT",
              taxCategory:
                "Consumption Tax",

              businessType:
                filingPeriod.businessType,

              businessName:
                filingPeriod.entityName,

              businessTrn:
                filingPeriod.businessTrn ||
                "",

              periodKey:
                filingPeriod.periodKey,

              periodStart:
                filingPeriod.periodStart,

              periodEnd:
                filingPeriod.periodEnd,

              filingFrequency:
                filingPeriod.filingFrequency,

              sourceType:
                "GCT Return",

              sourceModule:
                "Tax Center",

              sourceReference:
                filingPeriod.filingNumber,

              taxableAmount:
                roundMoney(
                  filingPeriod
                    .outputGctSummary
                    ?.taxableSales
                ),

              taxRate:
                Number(
                  filingPeriod.standardRate ||
                    0
                ),

              taxDue: netGct,
              amountPaid: 0,
              balanceDue: netGct,

              liabilityBreakdown: {
                gctOutputTax:
                  roundMoney(
                    filingPeriod.outputGct
                  ),

                gctInputTaxCredit:
                  roundMoney(
                    filingPeriod
                      .inputGctCredit
                  ),
              },

              calculationRuleCode:
                filingPeriod.rateRuleCode ||
                filingPeriod
                  .registrationCode,

              calculationSnapshot: {
                filingNumber:
                  filingPeriod.filingNumber,

                registrationSnapshot:
                  filingPeriod
                    .registrationSnapshot,

                outputGctSummary:
                  filingPeriod
                    .outputGctSummary,

                inputGctSummary:
                  filingPeriod
                    .inputGctSummary,

                outputGct:
                  filingPeriod.outputGct,

                inputGctCredit:
                  filingPeriod
                    .inputGctCredit,

                netGct:
                  filingPeriod.netGct,

                netPosition:
                  filingPeriod.netPosition,
              },

              filedDate:
                filingPeriod.filedDate,

              filingReference:
                filingPeriod
                  .filingReference,

              filingMethod:
                filingPeriod
                  .filingMethod,

              status: "Submitted",

              submittedBy:
                performedBy,

              submittedAt:
                performedAt,

              submissionNotes:
                String(notes || "").trim(),

              journalEntryNumber:
                filingPeriod
                  .settlementJournalEntryNumber ||
                "",

              notes:
                `Generated from GCT filing ${filingPeriod.filingNumber}.`,

              createdBy:
                performedBy,

              updatedBy:
                performedBy,

              workflowHistory: [
                {
                  fromStatus:
                    "Calculated",

                  toStatus:
                    "Submitted",

                  action:
                    "GCT Return Submission",

                  notes:
                    String(
                      notes || ""
                    ).trim(),

                  performedBy,

                  performedAt,
                },
              ],
            });
        }

        filingPeriod.taxRecordId =
          taxRecord._id;

        filingPeriod.taxNumber =
          taxRecord.taxNumber;
      }
    }

    if (action === "Review") {
      filingPeriod.reviewedBy =
        performedBy;

      filingPeriod.reviewedAt =
        performedAt;

      filingPeriod.reviewNotes =
        String(notes || "").trim();
    }

    if (action === "Approve") {
      filingPeriod.approvedBy =
        performedBy;

      filingPeriod.approvedAt =
        performedAt;

      filingPeriod.approvalNotes =
        String(notes || "").trim();
    }

    filingPeriod.status =
      workflowAction.toStatus;

    filingPeriod.updatedBy =
      performedBy;

    filingPeriod.workflowHistory.push({
      fromStatus: previousStatus,
      toStatus:
        workflowAction.toStatus,
      action,
      notes:
        String(notes || "").trim(),
      performedBy,
      performedAt,
    });

    await filingPeriod.save();

    res.json({
      success: true,

      message:
        `GCT filing ${filingPeriod.filingNumber} moved from ` +
        `${previousStatus} to ${filingPeriod.status}.`,

      data: {
        filingPeriod,

        taxRecord,

        settlementJournalEntryNumber:
          filingPeriod
            .settlementJournalEntryNumber ||
          "",
      },
    });
  } catch (error) {
    console.error(
      "GCT filing workflow error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not update the GCT filing workflow",
      error: error.message,
    });
  }
};

const getGctFilingPeriods = async (req, res) => {
  try {
    const {
      entityCode = "EK-SP-2026",
      periodKey = "",
      status = "",
      calculationMode = "",
    } = req.query;

    const query = {
      entityCode: String(entityCode).trim(),
    };

    if (periodKey) {
      query.periodKey =
        String(periodKey).trim();
    }

    if (status) {
      query.status =
        String(status).trim();
    }

    if (calculationMode) {
      query.calculationMode =
        String(calculationMode).trim();
    }

    const filingPeriods =
      await GctFilingPeriod.find(query).sort({
        periodStart: -1,
        createdAt: -1,
      });

    res.json({
      success: true,
      message:
        "GCT filing periods retrieved successfully",
      totalRecords: filingPeriods.length,
      data: filingPeriods,
    });
  } catch (error) {
    console.error(
      "Get GCT filing periods error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not retrieve GCT filing periods",
      error: error.message,
    });
  }
};

const calculateGctFilingPeriod = async (
  req,
  res
) => {
  try {
    const {
      entityCode = "EK-SP-2026",
      periodKey,
    } = req.body;

    if (!periodKey) {
      return res.status(400).json({
        success: false,
        message:
          "A GCT filing period using YYYY-MM is required.",
      });
    }

    const result =
      await generateGctFilingPeriod({
        entityCode:
          String(entityCode).trim(),
        periodKey:
          String(periodKey).trim(),
        user: req.user,
      });

    res.status(201).json({
      success: true,

      message:
        result.filingPeriod.calculationMode ===
        "Preview"
          ? "Preview GCT filing period generated successfully. No GCT liability or filing was created."
          : "GCT filing period calculated successfully.",

      data: result.filingPeriod,
      summary: result.summary,
    });
  } catch (error) {
    console.error(
      "Calculate GCT filing period error:",
      error
    );

    const conflict =
      String(error.message || "").includes(
        "cannot be recalculated"
      );

    const missingProfile =
      String(error.message || "").includes(
        "No active GCT registration profile"
      );

    res.status(
      conflict
        ? 409
        : missingProfile
          ? 404
          : 500
    ).json({
      success: false,
      message:
        "Could not calculate the GCT filing period",
      error: error.message,
    });
  }
};

const getGctFilingRegister = async (
  req,
  res
) => {
  try {
    const { periodKey } = req.params;

    const entityCode = String(
      req.query.entityCode ||
        "EK-SP-2026"
    ).trim();

    const registerType = String(
      req.query.registerType || ""
    ).trim();

    if (
      registerType &&
      ![
        "Output GCT",
        "Input GCT",
      ].includes(registerType)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Register type must be Output GCT or Input GCT.",
      });
    }

    const filingPeriod =
      await GctFilingPeriod.findOne({
        entityCode,
        periodKey,
      });

    if (!filingPeriod) {
      return res.status(404).json({
        success: false,
        message:
          `No GCT filing period exists for ${periodKey}.`,
      });
    }

    const register =
      await getGctRegister({
        entityCode,
        periodKey,
        registerType,
      });

    const summary = register.reduce(
      (totals, entry) => {
        totals.grossAmount +=
          Number(entry.grossAmount || 0);

        totals.taxableAmount +=
          Number(entry.taxableAmount || 0);

        totals.gctAmount +=
          Number(entry.gctAmount || 0);

        totals.claimableGctAmount +=
          Number(
            entry.claimableGctAmount || 0
          );

        totals.disallowedGctAmount +=
          Number(
            entry.disallowedGctAmount || 0
          );

        totals.pendingVerificationGctAmount +=
          Number(
            entry.pendingVerificationGctAmount ||
              0
          );

        if (
          entry.classificationStatus ===
          "Preliminary"
        ) {
          totals.preliminaryEntries += 1;
        }

        if (
          entry.eligibility
            ?.includedInReturn
        ) {
          totals.includedInReturn += 1;
        }

        return totals;
      },
      {
        recordCount: register.length,
        preliminaryEntries: 0,
        includedInReturn: 0,
        grossAmount: 0,
        taxableAmount: 0,
        gctAmount: 0,
        claimableGctAmount: 0,
        disallowedGctAmount: 0,
        pendingVerificationGctAmount: 0,
      }
    );

    [
      "grossAmount",
      "taxableAmount",
      "gctAmount",
      "claimableGctAmount",
      "disallowedGctAmount",
      "pendingVerificationGctAmount",
    ].forEach((field) => {
      summary[field] =
        roundMoney(summary[field]);
    });

    res.json({
      success: true,
      message:
        "GCT register retrieved successfully",
      filingPeriod: {
        filingNumber:
          filingPeriod.filingNumber,

        entityCode:
          filingPeriod.entityCode,

        periodKey:
          filingPeriod.periodKey,

        calculationMode:
          filingPeriod.calculationMode,

        registrationStatus:
          filingPeriod.registrationStatus,

        status:
          filingPeriod.status,

        canFileReturn:
          filingPeriod.canFileReturn,
      },

      filters: {
        entityCode,
        periodKey,
        registerType:
          registerType || "All",
      },

      summary,
      data: register,
    });
  } catch (error) {
    console.error(
      "Get GCT filing register error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not retrieve the GCT filing register",
      error: error.message,
    });
  }
};

const getGctRegistrationProfiles = async (req, res) => {
  try {
    const {
      entityCode = "",
      registrationStatus = "",
      status = "",
    } = req.query;

    const query = {
      taxType: "GCT",
    };

    if (entityCode) {
      query.entityCode = String(entityCode).trim();
    }

    if (registrationStatus) {
      query.registrationStatus =
        String(registrationStatus).trim();
    }

    if (status) {
      query.status = String(status).trim();
    }

    const profiles = await TaxRegistrationProfile.find(query).sort({
      effectiveFrom: -1,
      createdAt: -1,
    });

    res.json({
      success: true,
      message: "GCT registration profiles retrieved successfully",
      totalRecords: profiles.length,
      data: profiles,
    });
  } catch (error) {
    console.error("Get GCT registration profiles error:", error);

    res.status(500).json({
      success: false,
      message: "Could not retrieve GCT registration profiles",
      error: error.message,
    });
  }
};

const createGctRegistrationProfile = async (req, res) => {
  try {
    const {
      registrationCode,
      entityCode = "EK-SP-2026",
      entityName = "Eltham Konnect",
      businessType = "Sole Proprietorship",
      registrationStatus = "Not Registered",
      registrationNumber = "",
      trn = "",
      effectiveFrom,
      effectiveTo = null,
      thresholdAmount,
      thresholdCurrency = "JMD",
      monitoringMonths = 12,
      standardRate = 0,
      thresholdRuleEffectiveFrom = null,
      thresholdRuleEffectiveTo = null,
      sourceName = "",
      sourceUrl = "",
      sourceReference = "",
      sourceVerifiedAt = null,
      notes = "",
    } = req.body;

    if (!registrationCode || !effectiveFrom) {
      return res.status(400).json({
        success: false,
        message:
          "Registration code and effective-from date are required.",
      });
    }

    if (
      thresholdAmount === undefined ||
      thresholdAmount === null ||
      thresholdAmount === "" ||
      Number(thresholdAmount) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid GCT registration threshold is required.",
      });
    }

    const normalizedRegistrationCode =
      String(registrationCode).trim();

    const existingProfile =
      await TaxRegistrationProfile.findOne({
        registrationCode: normalizedRegistrationCode,
      });

    if (existingProfile) {
      return res.status(409).json({
        success: false,
        message:
          `GCT registration profile ${normalizedRegistrationCode} already exists.`,
      });
    }

    const performedBy = getUserName(req.user);

    const profile = await TaxRegistrationProfile.create({
      registrationCode: normalizedRegistrationCode,

      entityCode: String(entityCode).trim(),
      entityName: String(entityName).trim(),
      businessType,

      countryCode: "JM",
      taxType: "GCT",

      registrationStatus,
      registrationNumber:
        String(registrationNumber).trim(),
      trn: String(trn).trim(),

      effectiveFrom,
      effectiveTo,

            turnoverThreshold: {
        amount: roundMoney(thresholdAmount),
        currency:
          String(thresholdCurrency || "JMD")
            .trim()
            .toUpperCase(),
        monitoringMonths:
          Number(monitoringMonths || 12),
        effectiveFrom:
          thresholdRuleEffectiveFrom || effectiveFrom,
        effectiveTo:
          thresholdRuleEffectiveTo || null,
        ruleCode: "JM-GCT-THRESHOLD-2025-15M",
      },

      sourceName: String(sourceName).trim(),
      sourceUrl: String(sourceUrl).trim(),
      sourceReference:
        String(sourceReference).trim(),
      sourceVerifiedAt,

      notes: String(notes).trim(),

      status: "Draft",
      createdBy: performedBy,
      updatedBy: performedBy,
    });

    res.status(201).json({
      success: true,
      message:
        "Draft GCT registration profile created successfully",
      data: profile,
    });
  } catch (error) {
    console.error("Create GCT registration profile error:", error);

    res.status(500).json({
      success: false,
      message: "Could not create GCT registration profile",
      error: error.message,
    });
  }
};

const updateDraftGctRegistrationProfile = async (
  req,
  res
) => {
  try {
    const { registrationCode } = req.params;

    const profile = await TaxRegistrationProfile.findOne({
      registrationCode,
      taxType: "GCT",
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "GCT registration profile not found.",
      });
    }

    if (profile.status !== "Draft") {
      return res.status(409).json({
        success: false,
        message:
          "Only a Draft GCT registration profile can be corrected.",
      });
    }

    const {
      registrationStatus,
      registrationNumber,
      trn,
      effectiveFrom,
      effectiveTo,
      thresholdAmount,
      thresholdCurrency,
      monitoringMonths,
      thresholdRuleEffectiveFrom,
      thresholdRuleEffectiveTo,
      thresholdRuleCode,
      standardRate,
      sourceName,
      sourceUrl,
      sourceReference,
      sourceVerifiedAt,
      monitoringEnabled,
      notes,
    } = req.body;

    if (registrationStatus !== undefined) {
      profile.registrationStatus =
        String(registrationStatus).trim();
    }

    if (registrationNumber !== undefined) {
      profile.registrationNumber =
        String(registrationNumber || "").trim();
    }

    if (trn !== undefined) {
      profile.trn = String(trn || "").trim();
    }

    if (effectiveFrom !== undefined) {
      profile.effectiveFrom = effectiveFrom;
    }

    if (effectiveTo !== undefined) {
      profile.effectiveTo = effectiveTo || null;
    }

    if (thresholdAmount !== undefined) {
      const normalizedThreshold =
        roundMoney(thresholdAmount);

      if (normalizedThreshold <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "The GCT monitoring threshold must be greater than zero.",
        });
      }

      profile.turnoverThreshold.amount =
        normalizedThreshold;
    }

    if (thresholdCurrency !== undefined) {
      profile.turnoverThreshold.currency =
        String(thresholdCurrency || "JMD")
          .trim()
          .toUpperCase();
    }

    if (monitoringMonths !== undefined) {
      const normalizedMonths =
        Number(monitoringMonths);

      if (
        !Number.isInteger(normalizedMonths) ||
        normalizedMonths <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Monitoring months must be a positive whole number.",
        });
      }

      profile.turnoverThreshold.monitoringMonths =
        normalizedMonths;
    }

    if (thresholdRuleEffectiveFrom !== undefined) {
      profile.turnoverThreshold.effectiveFrom =
        thresholdRuleEffectiveFrom || null;
    }

    if (thresholdRuleEffectiveTo !== undefined) {
      profile.turnoverThreshold.effectiveTo =
        thresholdRuleEffectiveTo || null;
    }

    if (thresholdRuleCode !== undefined) {
      profile.turnoverThreshold.ruleCode =
        String(thresholdRuleCode || "").trim();
    }

    if (standardRate !== undefined) {
      profile.standardRate =
        Number(standardRate || 0);
    }

    if (sourceName !== undefined) {
      profile.sourceName =
        String(sourceName || "").trim();
    }

    if (sourceUrl !== undefined) {
      profile.sourceUrl =
        String(sourceUrl || "").trim();
    }

    if (sourceReference !== undefined) {
      profile.sourceReference =
        String(sourceReference || "").trim();
    }

    if (sourceVerifiedAt !== undefined) {
      profile.sourceVerifiedAt =
        sourceVerifiedAt || null;
    }

    if (monitoringEnabled !== undefined) {
      profile.monitoringEnabled =
        Boolean(monitoringEnabled);
    }

    if (notes !== undefined) {
      profile.notes =
        String(notes || "").trim();
    }

    profile.updatedBy = getUserName(req.user);

    await profile.save();

    res.json({
      success: true,
      message:
        "Draft GCT registration profile updated successfully",
      data: profile,
    });
  } catch (error) {
    console.error(
      "Update Draft GCT registration profile error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Could not update the Draft GCT registration profile",
      error: error.message,
    });
  }
};

const activateGctRegistrationProfile = async (req, res) => {
  try {
    const { registrationCode } = req.params;

    const profile = await TaxRegistrationProfile.findOne({
      registrationCode,
      taxType: "GCT",
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "GCT registration profile not found.",
      });
    }

    if (profile.status === "Active") {
      return res.status(409).json({
        success: false,
        message:
          `${profile.registrationCode} is already active.`,
      });
    }

    if (
      !profile.sourceName ||
      (!profile.sourceUrl &&
        !profile.sourceReference) ||
      !profile.sourceVerifiedAt
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The GCT profile cannot be activated until its official source and verification date are recorded.",
      });
    }

    if (
      profile.registrationStatus === "Registered" &&
      !profile.registrationNumber
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A GCT registration number is required for a Registered profile.",
      });
    }

    const overlappingProfile =
      await TaxRegistrationProfile.findOne({
        _id: {
          $ne: profile._id,
        },

        entityCode: profile.entityCode,
        taxType: "GCT",
        status: "Active",

        effectiveFrom: {
          $lte:
            profile.effectiveTo ||
            new Date("9999-12-31T23:59:59.999Z"),
        },

        $or: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              $gte: profile.effectiveFrom,
            },
          },
        ],
      });

    if (overlappingProfile) {
      return res.status(409).json({
        success: false,
        message:
          `${profile.registrationCode} overlaps active profile ${overlappingProfile.registrationCode}.`,
      });
    }

    profile.status = "Active";
    profile.updatedBy = getUserName(req.user);

    await profile.save();

    res.json({
      success: true,
      message:
        `${profile.registrationCode} activated successfully.`,
      data: profile,
    });
  } catch (error) {
    console.error("Activate GCT registration profile error:", error);

    res.status(500).json({
      success: false,
      message: "Could not activate GCT registration profile",
      error: error.message,
    });
  }
};

const getGctTurnoverMonitor = async (req, res) => {
  try {
    const entityCode = String(
      req.query.entityCode || "EK-SP-2026"
    ).trim();

    const asOfDate = String(
      req.query.asOfDate || ""
    ).trim();

    const monitor = await generateGctTurnoverMonitor({
      entityCode,
      asOfDate: asOfDate || new Date(),
    });

    res.json({
      success: true,
      message: "GCT turnover monitor generated successfully",
      data: monitor,
    });
  } catch (error) {
    console.error("GCT turnover monitor error:", error);

    const notFound =
      String(error.message || "").includes(
        "registration profile"
      );

    res.status(notFound ? 404 : 500).json({
      success: false,
      message: "Could not generate the GCT turnover monitor",
      error: error.message,
    });
  }
};

const getTaxCenterDashboard = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [
      taxRecords,
      payrolls,
      expenses,
      invoices,
    ] = await Promise.all([
      TaxRecord.find({
        status: {
          $ne: "Cancelled",
        },
      }),
      Payroll.find(getPayrollQuery()),
      Expense.find(),
      Invoice.find(),
    ]);

    const totalRevenue = roundMoney(
      invoices
        .filter((invoice) => invoice.status === "Paid")
        .reduce(
          (sum, invoice) =>
            sum + Number(invoice.finalTotal || 0),
          0
        )
    );

    const totalExpenses = roundMoney(
      expenses.reduce(
        (sum, expense) =>
          sum + Number(expense.amount || 0),
        0
      )
    );

    const payrollLiabilities =
      calculatePayrollLiabilities(payrolls);

    const totalTaxDue = roundMoney(
      taxRecords.reduce(
        (sum, record) => sum + Number(record.taxDue || 0),
        0
      )
    );

    const totalPaid = roundMoney(
      taxRecords.reduce(
        (sum, record) =>
          sum + Number(record.amountPaid || 0),
        0
      )
    );

    const currentLiabilities = roundMoney(
      taxRecords.reduce(
        (sum, record) =>
          sum + Number(record.balanceDue || 0),
        0
      )
    );

    const overdueRecords = taxRecords.filter(
      (record) =>
        record.dueDate &&
        record.dueDate < today &&
        Number(record.balanceDue || 0) > 0 &&
        record.status !== "Paid" &&
        record.status !== "Reconciled"
    );

        const overdueAmount = roundMoney(
      overdueRecords.reduce(
        (sum, record) =>
          sum + Number(record.balanceDue || 0),
        0
      )
    );

    const upcomingCutoff = new Date();
    upcomingCutoff.setUTCDate(
      upcomingCutoff.getUTCDate() + 30
    );

    const upcomingCutoffYmd =
      upcomingCutoff.toISOString().slice(0, 10);

    const upcomingRecords = taxRecords.filter(
      (record) =>
        record.dueDate &&
        record.dueDate >= today &&
        record.dueDate <= upcomingCutoffYmd &&
        Number(record.balanceDue || 0) > 0 &&
        ![
          "Paid",
          "Reconciled",
          "Cancelled",
        ].includes(record.status)
    );

    const upcomingAmount = roundMoney(
      upcomingRecords.reduce(
        (sum, record) =>
          sum + Number(record.balanceDue || 0),
        0
      )
    );

    const unfiledRecords = taxRecords.filter(
      (record) =>
        !record.filingReference &&
        ![
          "Submitted",
          "Paid",
          "Reconciled",
          "Cancelled",
        ].includes(record.status)
    );

    const missingDeadlineRecords =
      taxRecords.filter(
        (record) =>
          !record.dueDate &&
          Number(record.balanceDue || 0) > 0 &&
          ![
            "Paid",
            "Reconciled",
            "Cancelled",
          ].includes(record.status)
      );

    const statusCounts = taxRecords.reduce(
      (counts, record) => {
        counts[record.status] =
          Number(counts[record.status] || 0) + 1;

        return counts;
      },
      {}
    );

        let gctPosition = {
      configured: false,
      entityCode: "EK-SP-2026",
      registrationStatus: "Not Configured",
      canChargeGct: false,
      thresholdAmount: 0,
      monitoredTurnover: 0,
      thresholdUtilization: 0,
      remainingBeforeThreshold: 0,
      alertLevel: "Not Configured",
      invoiceCount: 0,
      unreviewedInvoices: 0,
      monitoringPeriod: null,
      notice:
        "No active GCT monitoring profile is configured.",
    };

    try {
            const gctMonitor =
        await generateGctTurnoverMonitor({
          entityCode: "EK-SP-2026",
          asOfDate: new Date()
            .toISOString()
            .slice(0, 10),
        });

      gctPosition = {
        configured: true,

        entityCode:
          gctMonitor.entity.entityCode,

        entityName:
          gctMonitor.entity.entityName,

        businessType:
          gctMonitor.entity.businessType,

        registrationStatus:
          gctMonitor.registration.registrationStatus,

        registrationNumber:
          gctMonitor.registration.registrationNumber,

        canChargeGct:
          gctMonitor.canChargeGct,

        thresholdAmount:
          gctMonitor.threshold.amount,

        thresholdCurrency:
          gctMonitor.threshold.currency,

        thresholdRuleCode:
          gctMonitor.threshold.ruleCode,

        monitoredTurnover:
          gctMonitor.totals.potentiallyTaxableTurnover,

        grossInvoiceAmount:
          gctMonitor.totals.grossInvoiceAmount,

        customerPurchaseRecovery:
          gctMonitor.totals.customerPurchaseRecovery,

        customsRecovery:
          gctMonitor.totals.customsRecovery,

        outputGct:
          gctMonitor.totals.outputGct,

        thresholdUtilization:
          gctMonitor.thresholdUtilization,

        remainingBeforeThreshold:
          gctMonitor.remainingBeforeThreshold,

        alertLevel:
          gctMonitor.alertLevel,

        invoiceCount:
          gctMonitor.totals.invoiceCount,

        unreviewedInvoices:
          gctMonitor.totals.unreviewedInvoices,

        monitoringPeriod:
          gctMonitor.monitoringPeriod,

        notice:
          gctMonitor.notice,
      };
    } catch (gctError) {
      console.error(
        "Tax dashboard GCT monitor warning:",
        gctError.message
      );

      gctPosition.notice =
        `GCT monitoring is unavailable: ${gctError.message}`;
    }

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalExpenses,

        payrollDeductions:
          payrollLiabilities.totalEmployeeDeductions,

        payrollGovernmentLiability:
          payrollLiabilities.totalGovernmentLiability,

        totalTaxDue,
        totalPaid,
        currentLiabilities,

        taxBalanceDue: currentLiabilities,
        taxRecordCount: taxRecords.length,

               overdueObligationCount:
          overdueRecords.length,
        overdueAmount,

        upcomingDeadlineCount:
          upcomingRecords.length,
        upcomingAmount,

        unfiledPeriodCount:
          unfiledRecords.length,

                missingDeadlineRuleCount:
          missingDeadlineRecords.length,

        statusCounts,

        gctPosition,

        upcomingDeadlines:
          upcomingRecords.map((record) => ({
            taxNumber: record.taxNumber,
            taxType: record.taxType,
            periodKey: record.periodKey,
            dueDate: record.dueDate,
            balanceDue: record.balanceDue,
            status: record.status,
          })),

        overdueObligations:
          overdueRecords.map((record) => ({
            taxNumber: record.taxNumber,
            taxType: record.taxType,
            periodKey: record.periodKey,
            dueDate: record.dueDate,
            balanceDue: record.balanceDue,
            status: record.status,
          })),

        unfiledPeriods:
          unfiledRecords.map((record) => ({
            taxNumber: record.taxNumber,
            taxType: record.taxType,
            periodKey: record.periodKey,
            balanceDue: record.balanceDue,
            status: record.status,
          })),

        missingDeadlineRules:
          missingDeadlineRecords.map(
            (record) => ({
              taxNumber: record.taxNumber,
              taxType: record.taxType,
              periodKey: record.periodKey,
              balanceDue: record.balanceDue,
              status: record.status,
            })
          ),
      },
    });
  } catch (error) {
    console.error("Tax dashboard error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load tax center dashboard",
      error: error.message,
    });
  }
};

module.exports = {
  getTaxCenterDashboard,
  getTaxRecords,
  createTaxRecord,

  generatePayrollTaxSummary,
  generatePayrollLiabilities,

  transitionTaxRecordWorkflow,
  payTaxRecord,

  getTaxDeadlineRules,
  createTaxDeadlineRule,
  activateTaxDeadlineRule,
  applyTaxDeadlines,

  transitionGctFilingWorkflow,
  getGctFilingPeriods,
  calculateGctFilingPeriod,
  getGctFilingRegister,

  getGctRegistrationProfiles,
  createGctRegistrationProfile,
  updateDraftGctRegistrationProfile,
  activateGctRegistrationProfile,
  getGctTurnoverMonitor,
};