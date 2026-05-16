const TaxRecord = require("../models/TaxRecord");
const Payroll = require("../models/Payroll");
const Expense = require("../models/Expense");
const Invoice = require("../models/Invoice");

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getTaxRecords = async (req, res) => {
  try {
    const records = await TaxRecord.find().sort({
      createdAt: -1,
    });

    const totalTaxDue = records.reduce(
      (sum, item) => sum + Number(item.taxDue || 0),
      0
    );

    const totalPaid = records.reduce(
      (sum, item) => sum + Number(item.amountPaid || 0),
      0
    );

    const totalBalance = records.reduce(
      (sum, item) => sum + Number(item.balanceDue || 0),
      0
    );

    res.json({
      success: true,
      summary: {
        totalRecords: records.length,
        totalTaxDue,
        totalPaid,
        totalBalance,
      },
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
      dueDate,
      notes,
    } = req.body;

    const taxDue = roundMoney(
      Number(taxableAmount || 0) * (Number(taxRate || 0) / 100)
    );

    const record = await TaxRecord.create({
      taxNumber: `TAX-${Date.now()}`,
      taxType,
      periodStart,
      periodEnd,
      taxableAmount: roundMoney(taxableAmount),
      taxRate: Number(taxRate || 0),
      taxDue,
      amountPaid: 0,
      balanceDue: taxDue,
      dueDate,
      status: "Draft",
      notes,
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
    const payrolls = await Payroll.find();

    const summary = payrolls.reduce(
      (sum, item) => ({
        grossPay: sum.grossPay + Number(item.grossPay || 0),
        nisEmployee: sum.nisEmployee + Number(item.nisEmployee || 0),
        nhtEmployee: sum.nhtEmployee + Number(item.nhtEmployee || 0),
        educationTax: sum.educationTax + Number(item.educationTax || 0),
        incomeTax: sum.incomeTax + Number(item.incomeTax || 0),
        totalDeductions:
          sum.totalDeductions + Number(item.totalDeductions || 0),
        netPay: sum.netPay + Number(item.netPay || 0),
      }),
      {
        grossPay: 0,
        nisEmployee: 0,
        nhtEmployee: 0,
        educationTax: 0,
        incomeTax: 0,
        totalDeductions: 0,
        netPay: 0,
      }
    );

    res.json({
      success: true,
      data: summary,
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

const getTaxCenterDashboard = async (req, res) => {
  try {
    const [taxRecords, payrolls, expenses, invoices] = await Promise.all([
      TaxRecord.find(),
      Payroll.find(),
      Expense.find(),
      Invoice.find(),
    ]);

    const totalRevenue = invoices
      .filter((invoice) => invoice.status === "Paid")
      .reduce((sum, invoice) => sum + Number(invoice.finalTotal || 0), 0);

    const totalExpenses = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0
    );

    const payrollDeductions = payrolls.reduce(
      (sum, payroll) => sum + Number(payroll.totalDeductions || 0),
      0
    );

    const taxBalanceDue = taxRecords.reduce(
      (sum, record) => sum + Number(record.balanceDue || 0),
      0
    );

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalExpenses,
        payrollDeductions,
        taxBalanceDue,
        taxRecordCount: taxRecords.length,
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
};