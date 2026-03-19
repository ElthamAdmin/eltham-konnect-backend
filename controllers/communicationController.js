const CommunicationLog = require("../models/CommunicationLog");
const Customer = require("../models/Customer");

const getCommunicationLogs = async (req, res) => {
  try {
    const user = req.user || {};
    let query = {};

    if (user.userType === "customer") {
      query.customerEkonId = user.ekonId;
    }

    const logs = await CommunicationLog.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Communication logs retrieved successfully",
      totalLogs: logs.length,
      data: logs,
    });
  } catch (error) {
    console.error("Error getting communication logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve communication logs",
    });
  }
};

const createCommunicationLog = async (req, res) => {
  try {
    const { customerEkonId, channel, subject, message } = req.body;

    if (!customerEkonId || !channel || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "All communication fields are required",
      });
    }

    const customer = await Customer.findOne({ ekonId: customerEkonId });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const newLog = await CommunicationLog.create({
      logNumber: `COM-${Date.now()}`,
      customerEkonId: customer.ekonId,
      customerName: customer.name,
      channel,
      subject,
      message,
      status: "Sent",
      date: new Date().toISOString().split("T")[0],
    });

    res.status(201).json({
      success: true,
      message: "Communication saved successfully",
      data: newLog,
    });
  } catch (error) {
    console.error("Error creating communication log:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save communication log",
      error: error.message,
    });
  }
};

module.exports = {
  getCommunicationLogs,
  createCommunicationLog,
};