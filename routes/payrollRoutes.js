const express = require("express");

const {
  getPayroll,
  getMyPayroll,
  createPayroll,
} = require("../controllers/payrollController");

const {
  protect,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const router = express.Router();

const canViewPayroll = requireAnyPermission([
  "payroll",
  "payrollManage",
  "payrollApprove",
  "finance",
]);

const canManagePayroll = requireAnyPermission([
  "payrollManage",
  "payroll",
  "finance",
]);

const canViewOwnPayslips = requireAnyPermission([
  "payslipSelfService",
  "payroll",
  "payrollManage",
  "payrollApprove",
  "finance",
]);

router.get("/", protect, canViewPayroll, getPayroll);

router.get(
  "/my-records",
  protect,
  canViewOwnPayslips,
  getMyPayroll
);

router.post("/", protect, canManagePayroll, createPayroll);

module.exports = router;