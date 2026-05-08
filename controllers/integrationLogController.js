const IntegrationLog = require("../models/IntegrationLog");

const getIntegrationLogs = async (req, res) => {
  try {
    const logs = await IntegrationLog.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Integration logs retrieved successfully",
      totalLogs: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error("Error loading integration logs:", error);

    res.status(500).json({
      success: false,
      message: "Could not load integration logs.",
      error: error.message,
    });
  }
};

module.exports = {
  getIntegrationLogs,
};