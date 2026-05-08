const integrationAuth = (req, res, next) => {
  const providedKey = req.headers["x-ekos-api-key"];
  const expectedKey = process.env.FREIGHT_INTEGRATION_API_KEY;

  if (!expectedKey) {
    return res.status(500).json({
      success: false,
      message: "Freight integration API key is not configured on the server.",
    });
  }

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      message: "Invalid or missing integration API key.",
    });
  }

  req.user = {
    userId: "FREIGHT-INTEGRATION",
    fullName: "Freight Partner API",
    role: "Integration",
  };

  next();
};

module.exports = integrationAuth;