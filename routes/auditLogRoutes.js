const express = require("express");
const router = express.Router();

const { getAuditLogs } = require("../controllers/auditLogController");
const {
  protect,
  requireAnyPermission,
} = require("../middleware/authMiddleware");

const canViewAuditLogs = requireAnyPermission([
  "hr",
  "finance",
  "accounting",
  "audit",
]);

router.get(
  "/",
  protect,
  canViewAuditLogs,
  getAuditLogs
);

module.exports = router;