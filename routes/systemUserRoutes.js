const express = require("express");
const router = express.Router();

const {
  getSystemUsers,
  createSystemUser,
  updateSystemUserStatus,
  updateSystemUserRole,
  updateSystemUserPermissions,
  resetSystemUserPassword,
} = require("../controllers/systemUserController");

const {
  protect,
  requirePermission,
} = require("../middleware/authMiddleware");

/**
 * 🔒 SECURITY LAYER
 * Only Admin or Users with "users" permission can manage system users
 */

// 🔹 Get all system users
router.get("/", protect, requirePermission("users"), getSystemUsers);

// 🔹 Create system user (can include linkedEmployeeId)
router.post("/", protect, requirePermission("users"), createSystemUser);

// 🔹 Update status (Active / Inactive)
router.put("/:userId/status", protect, requirePermission("users"), updateSystemUserStatus);

// 🔹 Update role + permissions
router.put("/:userId/role", protect, requirePermission("users"), updateSystemUserRole);

// 🔹 Update permissions only
router.put("/:userId/permissions", protect, requirePermission("users"), updateSystemUserPermissions);

// 🔹 Reset password
router.put("/:userId/reset-password", protect, requirePermission("users"), resetSystemUserPassword);

module.exports = router;