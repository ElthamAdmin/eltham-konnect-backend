const bcrypt = require("bcryptjs");
const SystemUser = require("../models/SystemUser");

const ALL_MODULE_PERMISSIONS = [
  "dashboard",
  "pos",
  "customers",
  "manifests",
  "packages",
  "invoices",
  "support",
  "finance",
  "communication",
  "marketing",
  "users",
  "settings",
  "warehouse",
  "pointsHistory",
];

const normalizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) return [];

  const cleaned = permissions
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return [...new Set(cleaned)].filter((item) =>
    ALL_MODULE_PERMISSIONS.includes(item)
  );
};

const getPermissionsForUser = (role, permissionsFromRequest) => {
  if (role === "Admin") {
    return ALL_MODULE_PERMISSIONS;
  }

  return normalizePermissions(permissionsFromRequest);
};

const getSystemUsers = async (req, res) => {
  try {
    const users = await SystemUser.find()
      .select("-passwordHash")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "System users retrieved successfully",
      totalUsers: users.length,
      data: users,
    });
  } catch (error) {
    console.error("Error getting system users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve system users",
    });
  }
};

const createSystemUser = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      role,
      branch,
      status,
      password,
      permissions,
    } = req.body;

    if (!fullName || !email || !role || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, role, and password are required",
      });
    }

    const existingUser = await SystemUser.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "A user with that email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await SystemUser.create({
      userId: `USR-${Date.now()}`,
      fullName,
      email,
      phone: phone || "",
      role,
      branch: branch || "Eltham Park",
      status: status || "Active",
      permissions: getPermissionsForUser(role, permissions),
      passwordHash,
      dutyStatus: "Off Duty",
    });

    const safeUser = await SystemUser.findById(user._id).select("-passwordHash");

    res.status(201).json({
      success: true,
      message: "System user created successfully",
      data: safeUser,
    });
  } catch (error) {
    console.error("Error creating system user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create system user",
      error: error.message,
    });
  }
};

const updateSystemUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    const validStatuses = ["Active", "Inactive"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user status",
      });
    }

    const user = await SystemUser.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "System user not found",
      });
    }

    user.status = status;
    await user.save();

    const safeUser = await SystemUser.findById(user._id).select("-passwordHash");

    res.json({
      success: true,
      message: "System user status updated successfully",
      data: safeUser,
    });
  } catch (error) {
    console.error("Error updating system user status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update system user status",
    });
  }
};

const updateSystemUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, permissions } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role is required",
      });
    }

    const user = await SystemUser.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "System user not found",
      });
    }

    user.role = role;
    user.permissions = getPermissionsForUser(role, permissions ?? user.permissions);
    await user.save();

    const safeUser = await SystemUser.findById(user._id).select("-passwordHash");

    res.json({
      success: true,
      message: "System user role updated successfully",
      data: safeUser,
    });
  } catch (error) {
    console.error("Error updating system user role:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update system user role",
    });
  }
};

const updateSystemUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    const user = await SystemUser.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "System user not found",
      });
    }

    if (user.role === "Admin") {
      user.permissions = ALL_MODULE_PERMISSIONS;
    } else {
      user.permissions = normalizePermissions(permissions);
    }

    await user.save();

    const safeUser = await SystemUser.findById(user._id).select("-passwordHash");

    res.json({
      success: true,
      message: "System user permissions updated successfully",
      data: safeUser,
    });
  } catch (error) {
    console.error("Error updating system user permissions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update system user permissions",
    });
  }
};

const resetSystemUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "New password is required",
      });
    }

    const user = await SystemUser.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "System user not found",
      });
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();

    res.json({
      success: true,
      message: "System user password reset successfully",
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset password",
    });
  }
};

module.exports = {
  getSystemUsers,
  createSystemUser,
  updateSystemUserStatus,
  updateSystemUserRole,
  updateSystemUserPermissions,
  resetSystemUserPassword,
};