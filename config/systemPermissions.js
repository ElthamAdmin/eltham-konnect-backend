const ALL_MODULE_PERMISSIONS = [
  "dashboard",
  "pos",
  "pos_manager_override",
  "pos_discount",
  "pos_void_refund",
  "pos_shift_reports",
  "pos_receipts",
  "customers",
  "manifests",
  "packages",
  "invoices",
  "prealerts",
  "support",
  "finance",
  "payroll",
  "payrollManage",
  "payrollApprove",
  "chartAccounts",
  "journalEntries",
  "generalLedger",
  "trialBalance",
  "profitLoss",
  "balanceSheet",
  "closePeriod",
  "accountsReceivable",
  "accountsPayable",
  "banking",
  "cashFlow",
  "fixedAssets",
  "taxCenter",
  "budgeting",
  "exports",
  "accountingPeriods",
  "fiscalYears",
  "limitedLiabilitySetup",
  "debtManager",
  "hr",
  "noticeBoard",
  "communication",
  "teamHub",
  "marketing",
  "rewards",
  "analytics",
  "amazon",
  "users",
  "duty",
  "audit",
  "integrations",
  "freightPartners",
  "unmatched",
  "settings",
  "warehouse",
  "pointsHistory",
  "points",
  "referrals",
  "hrSelfService",
  "leaveSelfService",
  "documentSelfService",
  "payslipSelfService",
];

const VALID_SYSTEM_ROLES = [
  "Admin",
  "Manager",
  "Warehouse",
  "Support",
  "Finance",
  "Marketing",
  "FrontDesk",
];

const HIGH_RISK_PERMISSIONS = [
  "users",
  "audit",
  "finance",
  "payrollManage",
  "payrollApprove",
  "journalEntries",
  "closePeriod",
  "banking",
  "taxCenter",
  "exports",
  "settings",
];

const normalizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) return [];

  return [
    ...new Set(
      permissions
        .map((permission) => String(permission || "").trim())
        .filter((permission) => ALL_MODULE_PERMISSIONS.includes(permission))
    ),
  ];
};

const getPermissionsForRole = (role, permissions) =>
  role === "Admin"
    ? [...ALL_MODULE_PERMISSIONS]
    : normalizePermissions(permissions);

module.exports = {
  ALL_MODULE_PERMISSIONS,
  VALID_SYSTEM_ROLES,
  HIGH_RISK_PERMISSIONS,
  normalizePermissions,
  getPermissionsForRole,
};