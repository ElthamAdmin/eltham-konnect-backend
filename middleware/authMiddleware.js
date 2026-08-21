const jwt = require("jsonwebtoken");

const getJwtSecret = () => {
  const secret = String(
    process.env.JWT_SECRET || ""
  ).trim();

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not configured."
    );
  }

  return secret;
};

const verifyToken = (token) => {
  return jwt.verify(
    token,
    getJwtSecret(),
    {
      algorithms: ["HS256"],
    }
  );
};

const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    req.user = decoded;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

const attachUserIfPresent = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";

    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = verifyToken(token);
      req.user = decoded;
    }

    next();
  } catch (error) {
    next();
  }
};

const hasPermission = (user, permission) => {
  if (!user) return false;
  if (user.role === "Admin") return true;

  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return permissions.includes(permission);
};

const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
    }

    next();
  };
};

const requireAnyPermission = (permissions = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const allowed = permissions.some((permission) =>
      hasPermission(req.user, permission)
    );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
    }

    next();
  };
};

module.exports = {
  protect,
  attachUserIfPresent,
  hasPermission,
  requirePermission,
  requireAnyPermission,
};