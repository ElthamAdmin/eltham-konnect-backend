const AuditLog = require("../models/AuditLog");

const getIpAddress = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }

  return (
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    ""
  );
};

const writeAuditLog = async ({
  req,
  action,
  module,
  description,
  targetType = "",
  targetId = "",
  metadata = {},
}) => {
  try {
    const user = req?.user || {};

    await AuditLog.create({
      auditNumber: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      action,
      module,
      description,
      performedByUserId: user.userId || "",
      performedByName: user.fullName || "System",
      performedByRole: user.role || "",
      targetType,
      targetId,
      metadata,
      ipAddress: getIpAddress(req),
    });
  } catch (error) {
    console.error("Audit log write failed:", error.message);
  }
};

module.exports = {
  writeAuditLog,
};