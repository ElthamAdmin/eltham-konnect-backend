const express = require("express");

const {
  getPayroll,
  getMyPayroll,
  previewPayroll,
  createPayroll,
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

router.get("/", protect, canViewPayroll, getPayroll);

router.get(
  "/my-records",
  protect,
  canViewOwnPayslips,
  getMyPayroll
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