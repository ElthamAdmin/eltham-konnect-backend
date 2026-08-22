const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const SystemUser = require("../models/SystemUser");
const { writeAuditLog } = require("../utils/auditLogger");
const {
  ALL_MODULE_PERMISSIONS,
  VALID_SYSTEM_ROLES,
  HIGH_RISK_PERMISSIONS,
  normalizePermissions,
  getPermissionsForRole,
} = require("../config/systemPermissions");

const safeSelect = "-passwordHash";
const nameOf = (user) => user?.fullName || user?.name || user?.email || "System";
const idOf = (user) => String(user?.userId || user?._id || user?.id || "").trim();
const isAdmin = (user) => user?.role === "Admin";
const normalizeReason = (value) => String(value || "").trim();
const passwordIsStrong = (value) =>
  String(value || "").length >= 12 &&
  /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) &&
  /[^A-Za-z0-9]/.test(value);

const publicSnapshot = (user) => ({
  userId: user.userId,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  branch: user.branch,
  status: user.status,
  permissions: user.permissions || [],
  linkedEmployeeId: user.linkedEmployeeId || "",
  securityVersion: Number(user.securityVersion || 0),
  requirePasswordChange: Boolean(user.requirePasswordChange),
});

const requireReason = (req, res) => {
  const reason = normalizeReason(req.body.reason);
  if (!reason) {
    res.status(400).json({ success: false, message: "A security-change reason is required." });
    return "";
  }
  return reason;
};

const assertAdminTargetAuthority = (req, res, target, proposedRole = target.role) => {
  if ((target.role === "Admin" || proposedRole === "Admin") && !isAdmin(req.user)) {
    res.status(403).json({ success: false, message: "Only an Admin may create or modify an Admin account." });
    return false;
  }
  return true;
};

const ensureAnotherActiveAdmin = async (target) => {
  if (target.role !== "Admin" || target.status !== "Active") return true;
  const count = await SystemUser.countDocuments({
    role: "Admin", status: "Active", _id: { $ne: target._id },
  });
  return count > 0;
};

const recordSecurityAudit = async ({ req, action, description, target, beforeValues, afterValues, metadata = {} }) =>
  writeAuditLog({
    req, action, module: "Security", description,
    targetType: "SystemUser", targetId: target.userId,
    beforeValues, afterValues,
    metadata: { reason: normalizeReason(req.body.reason), ...metadata },
  });

const getSystemPermissionCatalog = async (req, res) => res.json({
  success: true,
  data: {
    roles: VALID_SYSTEM_ROLES,
    permissions: ALL_MODULE_PERMISSIONS,
    highRiskPermissions: HIGH_RISK_PERMISSIONS,
  },
});

const getSystemUsers = async (req, res) => {
  try {
    const users = await SystemUser.find().select(safeSelect).sort({ createdAt: -1 });
    await writeAuditLog({
      req, action: "VIEW_SYSTEM_USERS", module: "Security",
      description: "Viewed the controlled system-user register.",
      targetType: "SystemUserRegister", metadata: { resultCount: users.length },
    });
    return res.json({ success: true, message: "System users retrieved successfully", totalUsers: users.length, data: users });
  } catch (error) {
    console.error("Error getting system users:", error);
    return res.status(500).json({ success: false, message: "Failed to retrieve system users" });
  }
};

const createSystemUser = async (req, res) => {
  try {
    const { fullName, email, phone, role, branch, status = "Active", password, permissions, linkedEmployeeId } = req.body;
    const reason = requireReason(req, res); if (!reason) return;
    if (!fullName || !email || !role || !password) return res.status(400).json({ success: false, message: "Full name, email, role, and password are required." });
    if (!VALID_SYSTEM_ROLES.includes(role)) return res.status(400).json({ success: false, message: "Select a valid controlled system role." });
    if (!["Active", "Inactive"].includes(status)) return res.status(400).json({ success: false, message: "System-user status must be Active or Inactive." });
    if (role === "Admin" && !isAdmin(req.user)) return res.status(403).json({ success: false, message: "Only an Admin may create another Admin account." });
    if (!passwordIsStrong(password)) return res.status(400).json({ success: false, message: "Password must contain at least 12 characters, including uppercase, lowercase, a number and a special character." });

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedEmployeeId = String(linkedEmployeeId || "").trim();
    if (await SystemUser.exists({ email: normalizedEmail })) return res.status(409).json({ success: false, message: "A user with that email already exists." });
    if (normalizedEmployeeId && await SystemUser.exists({ linkedEmployeeId: normalizedEmployeeId })) return res.status(409).json({ success: false, message: "That employee record is already linked to another system user." });

    const requestedPermissions = getPermissionsForRole(role, permissions);
    const grantsHighRisk = requestedPermissions.some((permission) => HIGH_RISK_PERMISSIONS.includes(permission));
    if (grantsHighRisk && !isAdmin(req.user)) return res.status(403).json({ success: false, message: "Only an Admin may grant high-risk permissions." });

    const now = new Date();
    const user = await SystemUser.create({
      userId: `USR-${crypto.randomUUID().toUpperCase()}`,
      fullName: String(fullName).trim(), email: normalizedEmail,
      phone: String(phone || "").trim(), role, branch: String(branch || "Eltham Park").trim(),
      status, permissions: requestedPermissions, passwordHash: await bcrypt.hash(password, 12),
      dutyStatus: "Off Duty", linkedEmployeeId: normalizedEmployeeId,
      securityVersion: 0, requirePasswordChange: true,
      passwordChangedAt: now, permissionsChangedAt: now, lastSecurityChangeAt: now,
    });
    await recordSecurityAudit({ req, action: "CREATE_SYSTEM_USER", description: `Created controlled system user ${user.userId}.`, target: user, beforeValues: null, afterValues: publicSnapshot(user) });
    const safeUser = await SystemUser.findById(user._id).select(safeSelect);
    return res.status(201).json({ success: true, message: "System user created successfully", data: safeUser });
  } catch (error) {
    console.error("Error creating system user:", error);
    return res.status(500).json({ success: false, message: error.code === 11000 ? "A user with the supplied unique details already exists." : "Failed to create system user" });
  }
};

const updateSystemUserStatus = async (req, res) => {
  try {
    const reason = requireReason(req, res); if (!reason) return;
    const { status } = req.body;
    if (!["Active", "Inactive"].includes(status)) return res.status(400).json({ success: false, message: "Invalid user status." });
    const user = await SystemUser.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ success: false, message: "System user not found." });
    if (!assertAdminTargetAuthority(req, res, user)) return;
    if (idOf(req.user) === user.userId && status === "Inactive") return res.status(409).json({ success: false, message: "You cannot deactivate your own account." });
    if (status === "Inactive" && !(await ensureAnotherActiveAdmin(user))) return res.status(409).json({ success: false, message: "The final active Admin account cannot be deactivated." });
    const beforeValues = publicSnapshot(user);
    user.status = status; user.securityVersion = Number(user.securityVersion || 0) + 1; user.lastSecurityChangeAt = new Date();
    await user.save();
    await recordSecurityAudit({ req, action: "CHANGE_SYSTEM_USER_STATUS", description: `Changed ${user.userId} status to ${status}.`, target: user, beforeValues, afterValues: publicSnapshot(user) });
    return res.json({ success: true, message: "System user status updated successfully", data: await SystemUser.findById(user._id).select(safeSelect) });
  } catch (error) { console.error("Status update error:", error); return res.status(500).json({ success: false, message: "Failed to update system user status" }); }
};

const updateSystemUserRole = async (req, res) => {
  try {
    const reason = requireReason(req, res); if (!reason) return;
    const { role, permissions } = req.body;
    if (!VALID_SYSTEM_ROLES.includes(role)) return res.status(400).json({ success: false, message: "Select a valid controlled system role." });
    const user = await SystemUser.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ success: false, message: "System user not found." });
    if (!assertAdminTargetAuthority(req, res, user, role)) return;
    if (idOf(req.user) === user.userId && role !== user.role) return res.status(409).json({ success: false, message: "You cannot change your own role." });
    if (user.role === "Admin" && role !== "Admin" && !(await ensureAnotherActiveAdmin(user))) return res.status(409).json({ success: false, message: "The final active Admin account cannot be demoted." });
    const nextPermissions = getPermissionsForRole(role, permissions ?? user.permissions);
    if (nextPermissions.some((item) => HIGH_RISK_PERMISSIONS.includes(item)) && !isAdmin(req.user)) return res.status(403).json({ success: false, message: "Only an Admin may grant high-risk permissions." });
    const beforeValues = publicSnapshot(user);
    user.role = role; user.permissions = nextPermissions; user.securityVersion = Number(user.securityVersion || 0) + 1;
    user.permissionsChangedAt = new Date(); user.lastSecurityChangeAt = new Date();
    await user.save();
    await recordSecurityAudit({ req, action: "CHANGE_SYSTEM_USER_ROLE", description: `Changed ${user.userId} role to ${role}.`, target: user, beforeValues, afterValues: publicSnapshot(user) });
    return res.json({ success: true, message: "System user role updated successfully", data: await SystemUser.findById(user._id).select(safeSelect) });
  } catch (error) { console.error("Role update error:", error); return res.status(500).json({ success: false, message: "Failed to update system user role" }); }
};

const updateSystemUserPermissions = async (req, res) => {
  try {
    const reason = requireReason(req, res); if (!reason) return;
    const user = await SystemUser.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ success: false, message: "System user not found." });
    if (!assertAdminTargetAuthority(req, res, user)) return;
    if (idOf(req.user) === user.userId) return res.status(409).json({ success: false, message: "You cannot change your own permissions." });
    const nextPermissions = getPermissionsForRole(user.role, req.body.permissions);
    if (nextPermissions.some((item) => HIGH_RISK_PERMISSIONS.includes(item)) && !isAdmin(req.user)) return res.status(403).json({ success: false, message: "Only an Admin may grant high-risk permissions." });
    const beforeValues = publicSnapshot(user);
    user.permissions = nextPermissions; user.securityVersion = Number(user.securityVersion || 0) + 1;
    user.permissionsChangedAt = new Date(); user.lastSecurityChangeAt = new Date();
    await user.save();
    await recordSecurityAudit({ req, action: "CHANGE_SYSTEM_USER_PERMISSIONS", description: `Changed permissions for ${user.userId}.`, target: user, beforeValues, afterValues: publicSnapshot(user), metadata: { added: nextPermissions.filter((item) => !beforeValues.permissions.includes(item)), removed: beforeValues.permissions.filter((item) => !nextPermissions.includes(item)) } });
    return res.json({ success: true, message: "System user permissions updated successfully", data: await SystemUser.findById(user._id).select(safeSelect) });
  } catch (error) { console.error("Permissions update error:", error); return res.status(500).json({ success: false, message: "Failed to update system user permissions" }); }
};

const resetSystemUserPassword = async (req, res) => {
  try {
    const reason = requireReason(req, res); if (!reason) return;
    const { password } = req.body;
    if (!passwordIsStrong(password)) return res.status(400).json({ success: false, message: "Password must contain at least 12 characters, including uppercase, lowercase, a number and a special character." });
    const user = await SystemUser.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ success: false, message: "System user not found." });
    if (!assertAdminTargetAuthority(req, res, user)) return;
    const beforeValues = { userId: user.userId, securityVersion: Number(user.securityVersion || 0), requirePasswordChange: Boolean(user.requirePasswordChange) };
    user.passwordHash = await bcrypt.hash(password, 12); user.requirePasswordChange = true;
    user.passwordChangedAt = new Date(); user.lastSecurityChangeAt = new Date(); user.securityVersion = Number(user.securityVersion || 0) + 1;
    await user.save();
    await recordSecurityAudit({ req, action: "RESET_SYSTEM_USER_PASSWORD", description: `Reset password for ${user.userId}; existing sessions were revoked.`, target: user, beforeValues, afterValues: { userId: user.userId, securityVersion: user.securityVersion, requirePasswordChange: true } });
    return res.json({ success: true, message: "System user password reset successfully. Existing sessions have been revoked." });
  } catch (error) { console.error("Password reset error:", error); return res.status(500).json({ success: false, message: "Failed to reset password" }); }
};

module.exports = {
  ALL_MODULE_PERMISSIONS,
  getSystemPermissionCatalog,
  getSystemUsers,
  createSystemUser,
  updateSystemUserStatus,
  updateSystemUserRole,
  updateSystemUserPermissions,
  resetSystemUserPassword,
};