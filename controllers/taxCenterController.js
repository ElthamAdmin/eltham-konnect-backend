const TaxRecord = require("../models/TaxRecord");
const Payroll = require("../models/Payroll");
const Expense = require("../models/Expense");
const Invoice = require("../models/Invoice");
const FinancialAccount = require("../models/FinancialAccount");
const AccountTransaction = require("../models/AccountTransaction");

const {
  postTaxLiabilityPayment,
} = require("../services/accountingService");

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

        overdueObligationCount: overdueRecords.length,
        overdueAmount,
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
};