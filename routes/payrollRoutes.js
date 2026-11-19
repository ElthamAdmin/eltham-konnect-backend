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
  requireAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

const {
  verifyLink,
} = require("../services/payrollEmployerLinkService");

router.post("/employer-links/verify", protect, requireAdmin, async (req, res) => {
  try {
    const {
      recordType, recordNumber, entityCode, evidenceReference,
    } = req.body || {};

    const link = await verifyLink({
      recordType, recordNumber, entityCode, evidenceReference, user: req.user,
    });

    return res.json({
      success: true,
      message: "Payroll ownership verified.",
      data: {
        recordType: link.recordType,
        recordNumber: link.recordNumber,
        entityCode: link.entityCode,
        verifiedAt: link.verifiedAt,
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status === 500) console.error("Payroll ownership verification:", error);
    return res.status(status).json({
      success: false,
      message: status === 500 ? "Could not verify payroll ownership." : error.message,
    });
  }
});

// Staff permitted to view the payroll register and payroll reports.
const canViewPayroll = requireAnyPermission([
  "payroll",
  "payrollManage",
  "payrollApprove",
  "finance",
]);

// Creating payroll, creating batches and issuing employee advances
// require explicit payroll preparation authority.
const canManagePayroll = requireAnyPermission([
  "payrollManage",
]);

// Approval, payment, cancellation and compliance reassessment
// remain restricted to the existing payroll approval permission.
const canApprovePayroll = requireAnyPermission([
  "payrollApprove",
]);

// The controller separately checks the signed-in user's HR employee link.
// This permission alone does not grant access to the staff payroll register.
const canViewOwnPayslips = requireAnyPermission([
  "hrSelfService",
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
  canManagePayroll,
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