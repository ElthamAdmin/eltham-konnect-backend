const FreightPartner = require("../models/FreightPartner");

const integrationAuth = async (req, res, next) => {
  try {
    const providedKey = req.headers["x-ekos-api-key"];

    if (!providedKey) {
      return res.status(401).json({
        success: false,
        message: "Missing integration API key.",
      });
    }

    const partner = await FreightPartner.findOne({
      apiKey: providedKey,
      status: "Active",
    });

    const fallbackKey = process.env.FREIGHT_INTEGRATION_API_KEY;

    if (!partner && providedKey !== fallbackKey) {
      return res.status(401).json({
        success: false,
        message: "Invalid or inactive integration API key.",
      });
    }

    req.integrationPartner = partner || {
      partnerName: "Legacy Freight Integration",
      partnerNumber: "LEGACY",
    };

    req.user = {
      userId: partner?.partnerNumber || "FREIGHT-INTEGRATION",
      fullName: partner?.partnerName || "Freight Partner API",
      role: "Integration",
    };

    next();
  } catch (error) {
    console.error("Integration auth error:", error);
    res.status(500).json({
      success: false,
      message: "Integration authentication failed.",
      error: error.message,
    });
  }
};

module.exports = integrationAuth;