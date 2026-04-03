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

router.get("/", protect, requirePermission("users"), getSystemUsers);
router.post("/", protect, requirePermission("users"), createSystemUser);
router.put("/:userId/status", protect, requirePermission("users"), updateSystemUserStatus);
router.put("/:userId/role", protect, requirePermission("users"), updateSystemUserRole);
router.put("/:userId/permissions", protect, requirePermission("users"), updateSystemUserPermissions);
router.put("/:userId/reset-password", protect, requirePermission("users"), resetSystemUserPassword);

module.exports = router;