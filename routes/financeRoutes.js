const express = require("express");
const router = express.Router();

const {
  getExpenses,
  createExpense,
  getPayroll,
  createPayroll,
  getFinanceSummary,
  getFinancialReports,
  getMonthlyIncomeVsExpenses,
} = require("../controllers/financeController");

router.get("/summary", getFinanceSummary);
router.get("/reports", getFinancialReports);
router.get("/monthly-chart", getMonthlyIncomeVsExpenses);

router.get("/expenses", getExpenses);
router.post("/expenses", createExpense);

router.get("/payroll", getPayroll);
router.post("/payroll", createPayroll);

module.exports = router;