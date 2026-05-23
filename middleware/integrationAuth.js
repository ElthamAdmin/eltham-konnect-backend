const FreightPartner = require("../models/FreightPartner");

const cleanBearerToken = (value = "") => {
  return String(value || "")
    .replace(/^Bearer\s+/i, "")
    .replace(/^Token\s+/i, "")
    .replace(/^ApiKey\s+/i, "")
    .replace(/^Api-Key\s+/i, "")
    .replace(/^Authorization:\s*/i, "")
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .trim();
};

const integrationAuth = async (req, res, next) => {
  try {
    const firstBodyItem = Array.isArray(req.body) ? req.body[0] || {} : req.body || {};

const providedKey = cleanBearerToken(
  req.headers.authorization ||
    req.headers.Authorization ||
    req.headers["x-ekos-api-key"] ||
    req.headers["x-api-key"] ||
    req.headers["x-api"] ||
    req.query.id ||
    req.query.apiToken ||
    firstBodyItem.apiToken ||
    firstBodyItem.ApiToken ||
    firstBodyItem.token ||
    ""
);

console.log("KP AUTH DEBUG:", {
  path: req.originalUrl,
  method: req.method,
  hasAuthorization: !!req.headers.authorization,
  hasQueryId: !!req.query.id,
  hasQueryApiToken: !!req.query.apiToken,
  hasBodyApiToken: !!firstBodyItem.apiToken,
  providedKeyPreview: providedKey ? `${providedKey.slice(0, 10)}...` : "NONE",
});
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