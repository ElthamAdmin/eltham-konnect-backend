const express = require("express");

const {
  getPayroll,
  getMyPayroll,
  getPayrollRegister,
  getEmployeePayrollYtd,
  reassessPayrollCompliance,
  previewPayroll,
  previewPayrollBatch,
  createPayroll,
  createPayrollBatch,
  approvePayroll,
  payPayroll,
  cancelPayroll,
} = require("../controllers/payrollController");

const {
  getEmployeeAdvances,
  createEmployeeAdvance,
} = require("../controllers/employeeAdvanceController");

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

const canApprovePayroll = requireAnyPermission([
  "payrollApprove",
]);

const canViewOwnPayslips = requireAnyPermission([
  "payslipSelfService",
  "payroll",
  "payrollManage",
  "payrollApprove",
  "finance",
]);

router.get(
  "/advances",
  protect,
  canViewPayroll,
  getEmployeeAdvances
);

router.post(
  "/advances",
  protect,
  canManagePayroll,
  createEmployeeAdvance
);

router.post(
  "/preview",
  protect,
  canViewPayroll,
  previewPayroll
);

router.post(
  "/batch/preview",
  protect,
  canManagePayroll,
  previewPayrollBatch
);

router.get(
  "/reports/register",
  protect,
  canViewPayroll,
  getPayrollRegister
);

router.get(
  "/reports/ytd/:employeeId",
  protect,
  canViewPayroll,
  getEmployeePayrollYtd
);

router.get("/", protect, canViewPayroll, getPayroll);

router.get(
  "/my-records",
  protect,
  canViewOwnPayslips,
  getMyPayroll
);

router.post(
  "/:payrollNumber/reassess-compliance",
  protect,
  canApprovePayroll,
  reassessPayrollCompliance
);

router.post(
  "/batch",
  protect,
  canManagePayroll,
  createPayrollBatch
);

router.post(
  "/:payrollNumber/approve",
  protect,
  canApprovePayroll,
  approvePayroll
);

router.post(
  "/:payrollNumber/pay",
  protect,
  canApprovePayroll,
  payPayroll
);

router.post(
  "/:payrollNumber/cancel",
  protect,
  canApprovePayroll,
  cancelPayroll
);

router.post("/", protect, canManagePayroll, createPayroll);

module.exports = router;