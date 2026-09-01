const jwt = require("jsonwebtoken");
const SystemUser = require("../models/SystemUser");
const Customer = require("../models/Customer");

const getJwtSecret = () => {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) throw new Error("JWT_SECRET is not configured.");
  return secret;
};

const verifyToken = (token) => jwt.verify(token, getJwtSecret());

const loadCurrentUser = async (decoded) => {
  const user = await SystemUser.findOne({ userId: decoded.userId }).lean();

  if (!user || user.status !== "Active") {
    const error = new Error("This user session is no longer active.");
    error.code = "SESSION_INACTIVE";
    throw error;
  }

  if (Number(decoded.securityVersion || 0) !== Number(user.securityVersion || 0)) {
    const error = new Error("Your security access changed. Please sign in again.");
    error.code = "SESSION_REVOKED";
    throw error;
  }

  return {
    ...decoded,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    branch: user.branch,
    status: user.status,
    dutyStatus: user.dutyStatus,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    linkedEmployeeId: user.linkedEmployeeId || "",
    securityVersion: Number(user.securityVersion || 0),
    requirePasswordChange: Boolean(user.requirePasswordChange),
  };
};

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const decoded = verifyToken(authHeader.split(" ")[1]);
    req.user = await loadCurrentUser(decoded);
    return next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    return res.status(401).json({
      success: false,
      code: error.code || "INVALID_TOKEN",
      message: error.message || "Invalid or expired token",
    });
  }
};

const protectCustomer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No customer token provided",
      });
    }

    const decoded = verifyToken(authHeader.split(" ")[1]);

    if (decoded.userType !== "customer" || !decoded.ekonId) {
      return res.status(403).json({
        success: false,
        message: "Customer access only",
      });
    }

    const customer = await Customer.findOne({
      ekonId: decoded.ekonId,
      status: "Active",
    })
      .select("ekonId name email phone branch status")
      .lean();

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: "This customer session is no longer active.",
      });
    }

    req.user = {
      ...decoded,
      customerId: customer._id.toString(),
      ekonId: customer.ekonId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      branch: customer.branch,
      status: customer.status,
      userType: "customer",
    };

    return next();
  } catch (error) {
    console.error("Customer auth middleware error:", error.message);

    return res.status(401).json({
      success: false,
      code: error.code || "INVALID_CUSTOMER_TOKEN",
      message: error.message || "Invalid or expired customer token",
    });
  }
};

const attachUserIfPresent = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      const decoded = verifyToken(authHeader.split(" ")[1]);
      req.user = await loadCurrentUser(decoded);
    }
  } catch (error) {
    req.user = undefined;
  }

  return next();
};

const hasPermission = (user, permission) => {
  if (!user) return false;
  if (user.role === "Admin") return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
};

const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  if (!hasPermission(req.user, permission)) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to access this resource",
    });
  }

  return next();
};

const requireAnyPermission = (permissions = []) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  if (!permissions.some((permission) => hasPermission(req.user, permission))) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to access this resource",
    });
  }

  return next();
};

module.exports = {
  protect,
  protectCustomer,
  attachUserIfPresent,
  hasPermission,
  requirePermission,
  requireAnyPermission,
};