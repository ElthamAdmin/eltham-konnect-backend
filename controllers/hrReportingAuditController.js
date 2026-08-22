const AuditLog = require("../models/AuditLog");

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalize = (value) => String(value || "").trim();

const escapeCsv = (value) => {
  const text = value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
};

const validateDate = (value, label) => {
  if (!value) return;
  if (!YMD_PATTERN.test(value) || Number.isNaN(new Date(`${value}T12:00:00.000Z`).getTime())) {
    throw new Error(`${label} must use a valid YYYY-MM-DD date.`);
  }
};

const buildDateQuery = (from, to) => {
  validateDate(from, "Audit start date");
  validateDate(to, "Audit end date");

  if (from && to && from > to) {
    throw new Error("Audit end date cannot be earlier than its start date.");
  }

  const createdAt = {};
  if (from) createdAt.$gte = new Date(`${from}T00:00:00.000-05:00`);
  if (to) createdAt.$lte = new Date(`${to}T23:59:59.999-05:00`);
  return Object.keys(createdAt).length ? createdAt : null;
};

const getHRReportingAudit = async (req, res) => {
  try {
    const from = normalize(req.query.from);
    const to = normalize(req.query.to);
    const format = normalize(req.query.format).toLowerCase();
    const createdAt = buildDateQuery(from, to);

    const query = {
      module: "HR Reporting",
      action: "VIEW_HR_REPORT",
    };

    if (createdAt) query.createdAt = createdAt;

    const events = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    if (format === "csv") {
      const headings = [
        "Audit Number",
        "Date and Time",
        "User",
        "Role",
        "Report",
        "Result",
        "HTTP Method",
        "Response Status",
        "Duration MS",
        "Exported",
        "IP Address",
        "Browser",
        "Device",
        "Filters",
      ];

      const rows = events.map((event) => [
        event.auditNumber,
        event.createdAt?.toISOString?.() || event.createdAt,
        event.performedByName,
        event.performedByRole,
        event.targetId,
        event.status,
        event.requestMethod,
        event.metadata?.responseStatus,
        event.metadata?.durationMs,
        event.metadata?.exported,
        event.ipAddress,
        event.browser,
        event.device,
        event.metadata?.query || {},
      ]);

      const csv = [headings, ...rows]
        .map((row) => row.map(escapeCsv).join(","))
        .join("\r\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="h11-reporting-audit-${to || "current"}.csv"`
      );
      return res.send(`\uFEFF${csv}`);
    }

    const successfulEvents = events.filter((event) => event.status === "Success");
    const failedEvents = events.filter((event) => event.status === "Failed");
    const missingActorEvents = events.filter(
      (event) => !normalize(event.performedByUserId) || !normalize(event.performedByName)
    );

    const endpointCounts = {};
    const userCounts = {};

    events.forEach((event) => {
      const endpoint = normalize(event.targetId) || "Unknown";
      const user = normalize(event.performedByName) || "Unknown";
      endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + 1;
      userCounts[user] = (userCounts[user] || 0) + 1;
    });

    return res.json({
      success: true,
      message: "H11 reporting audit retrieved successfully.",
      filters: { from, to },
      summary: {
        totalEvents: events.length,
        successfulEvents: successfulEvents.length,
        failedEvents: failedEvents.length,
        activeUsers: Object.keys(userCounts).length,
        reportEndpoints: Object.keys(endpointCounts).length,
        exportedEvents: events.filter((event) => event.metadata?.exported === true).length,
        missingActorEvents: missingActorEvents.length,
      },
      endpointCounts,
      userCounts,
      data: events.slice(0, 100),
    });
  } catch (error) {
    const validationError = /date|earlier/.test(String(error.message || "").toLowerCase());
    return res.status(validationError ? 400 : 500).json({
      success: false,
      message: error.message || "Failed to retrieve H11 reporting audit.",
    });
  }
};

module.exports = {
  getHRReportingAudit,
};