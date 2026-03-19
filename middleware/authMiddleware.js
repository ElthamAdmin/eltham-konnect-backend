const jwt = require("jsonwebtoken");

const verifyToken = (token) => {
  return jwt.verify(
    token,
    process.env.JWT_SECRET || "eltham-konnect-secret"
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
    res.status(401).json({
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

module.exports = {
  protect,
  attachUserIfPresent,
};