const CommunicationLog = require("../models/CommunicationLog");
const Customer = require("../models/Customer");
const { writeAuditLog } = require("../utils/auditLogger");

const getJamaicaDateString = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
};

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
      error: error.message,
    });
  }
};

const createCommunicationLog = async (req, res) => {
  try {
    const {
      recipientMode,
      customerEkonId,
      customerEkonIds,
      channel,
      subject,
      message,
    } = req.body;

    if (!channel || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Channel, subject, and message are required",
      });
    }

    const mode = recipientMode || "single";
    let recipients = [];

    if (mode === "single") {
      if (!customerEkonId) {
        return res.status(400).json({
          success: false,
          message: "Please select one customer",
        });
      }

      const customer = await Customer.findOne({ ekonId: customerEkonId });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      recipients = [customer];
    } else if (mode === "selected") {
      if (!Array.isArray(customerEkonIds) || customerEkonIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Please select at least one customer",
        });
      }

      recipients = await Customer.find({
        ekonId: { $in: customerEkonIds },
      });

      if (recipients.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No selected customers were found",
        });
      }
    } else if (mode === "all") {
      recipients = await Customer.find();

      if (recipients.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No customers found to receive this communication",
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid recipient mode",
      });
    }

    const today = getJamaicaDateString();
    const createdLogs = [];

    for (const customer of recipients) {
      const newLog = await CommunicationLog.create({
        logNumber: `COM-${Date.now()}-${customer.ekonId}`,
        customerEkonId: customer.ekonId,
        customerName: customer.name,
        recipientMode: mode,
        channel,
        subject,
        message,
        status: "Sent",
        date: today,
      });

      createdLogs.push(newLog);

      if (req.user) {
        await writeAuditLog({
          req,
          action: "CREATE_COMMUNICATION_LOG",
          module: "Communication",
          description: `Communication ${newLog.logNumber} created for ${newLog.customerName} via ${newLog.channel}`,
          targetType: "Communication",
          targetId: newLog.logNumber,
          metadata: {
            customerEkonId: newLog.customerEkonId,
            customerName: newLog.customerName,
            channel: newLog.channel,
            subject: newLog.subject,
            status: newLog.status,
            recipientMode: mode,
          },
        });
      }
    }

    res.status(201).json({
      success: true,
      message:
        mode === "all"
          ? `Communication saved for all customers (${createdLogs.length} recipients)`
          : mode === "selected"
          ? `Communication saved for selected customers (${createdLogs.length} recipients)`
          : "Communication saved successfully",
      totalRecipients: createdLogs.length,
      data: createdLogs,
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