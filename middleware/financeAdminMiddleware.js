const requireFinanceAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (req.user.role !== "Admin") {
    return res.status(403).json({
      success: false,
      message:
        "Only the Owner/Admin can access this financial control.",
    });
  }

  return next();
};

module.exports = {
  requireFinanceAdmin,
};