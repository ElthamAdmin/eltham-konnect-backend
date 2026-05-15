const DebtAccount = require("../models/DebtAccount");
const DebtPayment = require("../models/DebtPayment");
const { writeAuditLog } = require("../utils/auditLogger");

const getJamaicaDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const getDebtManagerData = async (req, res) => {
  try {
    const debts = await DebtAccount.find().sort({ createdAt: -1 });
    const payments = await DebtPayment.find().sort({ paymentDate: -1, createdAt: -1 });

    const totalStartingDebt = debts.reduce((sum, debt) => sum + Number(debt.startingBalance || 0), 0);
    const totalCurrentDebt = debts.reduce((sum, debt) => sum + Number(debt.currentBalance || 0), 0);
    const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
    const monthlyRequired = debts
      .filter((debt) => debt.status === "Active")
      .reduce((sum, debt) => sum + Number(debt.monthlyPayment || 0), 0);

    res.json({
      success: true,
      message: "Debt manager data retrieved successfully",
      data: {
        debts,
        payments,
        summary: {
          totalStartingDebt,
          totalCurrentDebt,
          totalPaid,
          monthlyRequired,
          payoffProgress:
            totalStartingDebt > 0
              ? Number((((totalStartingDebt - totalCurrentDebt) / totalStartingDebt) * 100).toFixed(2))
              : 0,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load debt manager data.",
      error: error.message,
    });
  }
};

const createDebtAccount = async (req, res) => {
  try {
    const {
      debtName,
      debtType,
      lenderName,
      startingBalance,
      currentBalance,
      monthlyPayment,
      interestRate,
      dueDay,
      startDate,
      targetPayoffDate,
      notes,
    } = req.body;

    if (!debtName) {
      return res.status(400).json({ success: false, message: "Debt name is required." });
    }

    const startBalance = Number(startingBalance || 0);

    const debt = await DebtAccount.create({
      debtNumber: `DEBT-${Date.now()}`,
      debtName,
      debtType,
      lenderName,
      startingBalance: startBalance,
      currentBalance: currentBalance !== undefined && currentBalance !== "" ? Number(currentBalance) : startBalance,
      monthlyPayment: Number(monthlyPayment || 0),
      interestRate: Number(interestRate || 0),
      dueDay: dueDay ? Number(dueDay) : null,
      startDate,
      targetPayoffDate,
      notes,
      status: "Active",
    });

    await writeAuditLog({
      req,
      action: "CREATE_DEBT_ACCOUNT",
      module: "Debt Manager",
      description: `Debt account ${debt.debtName} was created`,
      targetType: "DebtAccount",
      targetId: debt.debtNumber,
      metadata: debt,
    });

    res.status(201).json({
      success: true,
      message: "Debt account created successfully.",
      data: debt,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not create debt account.",
      error: error.message,
    });
  }
};

const updateDebtAccount = async (req, res) => {
  try {
    const { debtNumber } = req.params;

    const debt = await DebtAccount.findOneAndUpdate(
      { debtNumber },
      { $set: req.body },
      { new: true }
    );

    if (!debt) {
      return res.status(404).json({ success: false, message: "Debt account not found." });
    }

    await writeAuditLog({
      req,
      action: "UPDATE_DEBT_ACCOUNT",
      module: "Debt Manager",
      description: `Debt account ${debt.debtName} was updated`,
      targetType: "DebtAccount",
      targetId: debt.debtNumber,
      metadata: req.body,
    });

    res.json({
      success: true,
      message: "Debt account updated successfully.",
      data: debt,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not update debt account.",
      error: error.message,
    });
  }
};

const recordDebtPayment = async (req, res) => {
  try {
    const { debtNumber } = req.params;
    const { amountPaid, paymentDate, paidFrom, notes } = req.body;

    if (!amountPaid || Number(amountPaid) <= 0) {
      return res.status(400).json({ success: false, message: "Enter a valid payment amount." });
    }

    const debt = await DebtAccount.findOne({ debtNumber });

    if (!debt) {
      return res.status(404).json({ success: false, message: "Debt account not found." });
    }

    const paymentAmount = Number(amountPaid || 0);

    const payment = await DebtPayment.create({
      paymentNumber: `DPAY-${Date.now()}`,
      debtNumber: debt.debtNumber,
      debtName: debt.debtName,
      amountPaid: paymentAmount,
      paymentDate: paymentDate || getJamaicaDateString(),
      paidFrom,
      notes,
    });

    debt.currentBalance = Math.max(0, Number(debt.currentBalance || 0) - paymentAmount);

    if (debt.currentBalance <= 0) {
      debt.status = "Paid Off";
    }

    await debt.save();

    await writeAuditLog({
      req,
      action: "RECORD_DEBT_PAYMENT",
      module: "Debt Manager",
      description: `Payment of JMD ${paymentAmount.toLocaleString()} recorded for ${debt.debtName}`,
      targetType: "DebtPayment",
      targetId: payment.paymentNumber,
      metadata: {
        debtNumber: debt.debtNumber,
        amountPaid: paymentAmount,
        newBalance: debt.currentBalance,
      },
    });

    res.json({
      success: true,
      message: "Debt payment recorded successfully.",
      data: {
        payment,
        debt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not record debt payment.",
      error: error.message,
    });
  }
};

module.exports = {
  getDebtManagerData,
  createDebtAccount,
  updateDebtAccount,
  recordDebtPayment,
};