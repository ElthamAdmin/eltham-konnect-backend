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

// 🔹 Get all system users
router.get("/", getSystemUsers);

// 🔹 Create system user (can include linkedEmployeeId)
router.post("/", createSystemUser);

// 🔹 Update status (Active / Inactive)
router.put("/:userId/status", updateSystemUserStatus);

// 🔹 Update role + permissions
router.put("/:userId/role", updateSystemUserRole);

// 🔹 Update permissions only
router.put("/:userId/permissions", updateSystemUserPermissions);

// 🔹 Reset password
router.put("/:userId/reset-password", resetSystemUserPassword);

module.exports = router;