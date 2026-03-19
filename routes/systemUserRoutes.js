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

router.get("/", getSystemUsers);
router.post("/", createSystemUser);
router.put("/:userId/status", updateSystemUserStatus);
router.put("/:userId/role", updateSystemUserRole);
router.put("/:userId/permissions", updateSystemUserPermissions);
router.put("/:userId/reset-password", resetSystemUserPassword);

module.exports = router;