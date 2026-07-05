const AuditLog = require("../models/AuditLog");

const getIpAddress = (req) => {
  const forwarded = req?.headers?.["x-forwarded-for"];

  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }

  return (
    req?.ip ||
    req?.connection?.remoteAddress ||
    req?.socket?.remoteAddress ||
    ""
  );
};

const getUserAgent = (req) => String(req?.headers?.["user-agent"] || "");

const getBrowserName = (userAgent = "") => {
  const ua = userAgent.toLowerCase();

  if (ua.includes("edg")) return "Microsoft Edge";
  if (ua.includes("chrome")) return "Chrome";
  if (ua.includes("firefox")) return "Firefox";
  if (ua.includes("safari")) return "Safari";
  if (ua.includes("opera") || ua.includes("opr")) return "Opera";

  return userAgent ? "Unknown Browser" : "";
};

const getDeviceType = (userAgent = "") => {
  const ua = userAgent.toLowerCase();

  if (ua.includes("mobile")) return "Mobile";
  if (ua.includes("tablet") || ua.includes("ipad")) return "Tablet";

  return userAgent ? "Desktop" : "";
};

const writeAuditLog = async ({
  req,
  action,
  module,
  description,
  targetType = "",
  targetId = "",
  metadata = {},
  beforeValues = null,
  afterValues = null,
  financeReference = "",
  journalEntryNumber = "",
  ledgerNumber = "",
  accountingPeriod = "",
  fiscalYear = null,
  accountNumber = "",
  accountName = "",
  reconciliationNumber = "",
  status = "Success",
  performedByName = "",
  performedByUserId = "",
  performedByRole = "",
}) => {
  try {
    const user = req?.user || {};
    const userAgent = getUserAgent(req);

    await AuditLog.create({
      auditNumber: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      action,
      module,
      description,
      performedByUserId: performedByUserId || user.userId || user._id || "",
      performedByName:
        performedByName || user.fullName || user.name || user.email || "System",
      performedByRole: performedByRole || user.role || "",
      targetType,
      targetId,
      metadata,
      beforeValues,
      afterValues,
      financeReference,
      journalEntryNumber,
      ledgerNumber,
      accountingPeriod,
      fiscalYear,
      accountNumber,
      accountName,
      reconciliationNumber,
      status,
      ipAddress: getIpAddress(req),
      browser: getBrowserName(userAgent),
      device: getDeviceType(userAgent),
      requestMethod: req?.method || "",
      requestUrl: req?.originalUrl || req?.url || "",
    });
  } catch (error) {
    console.error("Audit log write failed:", error.message);
  }
};

module.exports = {
  writeAuditLog,
};