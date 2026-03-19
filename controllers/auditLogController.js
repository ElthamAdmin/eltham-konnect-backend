const AuditLog = require("../models/AuditLog");

const getAuditLogs = async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Audit logs retrieved successfully",
      totalLogs: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error("Error retrieving audit logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve audit logs",
    });
  }
};

module.exports = {
  getAuditLogs,
};