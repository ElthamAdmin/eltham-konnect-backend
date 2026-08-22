const { writeAuditLog } = require("../utils/auditLogger");

const auditHRReportAccess = (req, res, next) => {
  const startedAt = Date.now();

  res.once("finish", () => {
    const successful = res.statusCode >= 200 && res.statusCode < 400;

    void writeAuditLog({
      req,
      action: "VIEW_HR_REPORT",
      module: "HR Reporting",
      description: `${successful ? "Viewed" : "Failed to view"} HR report ${req.path}.`,
      targetType: "HRReport",
      targetId: req.path,
      status: successful ? "Success" : "Failed",
      metadata: {
        query: req.query || {},
        responseStatus: res.statusCode,
        durationMs: Date.now() - startedAt,
        exported: String(req.query?.format || "").toLowerCase() === "csv",
      },
    });
  });

  next();
};

module.exports = {
  auditHRReportAccess,
};