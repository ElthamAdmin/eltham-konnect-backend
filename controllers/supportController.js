const SupportTicket = require("../models/SupportTicket");
const CustomerNotification = require("../models/CustomerNotification");

const getTickets = async (req, res) => {
  try {
    const user = req.user || {};
    const query = {};

    if (user.userType === "customer") {
      query.customerEkonId = user.ekonId;
    }

    const tickets = await SupportTicket.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Support tickets retrieved successfully",
      totalTickets: tickets.length,
      data: tickets,
    });
  } catch (error) {
    console.error("Error getting support tickets:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve support tickets",
      error: error.message,
    });
  }
};

const createTicket = async (req, res) => {
  try {
    const user = req.user || {};

    let customerEkonId = req.body.customerEkonId;
    let customerName = req.body.customerName;

    if (user.userType === "customer") {
      customerEkonId = user.ekonId;
      customerName = user.name;
    }

    const { subject, message } = req.body;

    if (!customerEkonId || !customerName || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "All support ticket fields are required",
      });
    }

    const newTicket = await SupportTicket.create({
      ticketNumber: `TCK-${Date.now()}`,
      customerEkonId,
      customerName,
      subject,
      message,
      attachmentFileName: req.file ? req.file.filename : "",
      attachmentFilePath: req.file
        ? `/uploads/support-attachments/${req.file.filename}`
        : "",
      replies: [],
      status: "Open",
      date: new Date().toISOString().split("T")[0],
    });

    res.status(201).json({
      success: true,
      message: "Support ticket created successfully",
      data: newTicket,
    });
  } catch (error) {
    console.error("Error creating support ticket:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create support ticket",
      error: error.message,
    });
  }
};

const addReplyToTicket = async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { message } = req.body;
    const user = req.user || {};

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Reply message is required",
      });
    }

    const ticket = await SupportTicket.findOne({ ticketNumber });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found",
      });
    }

    if (
      user.userType === "customer" &&
      ticket.customerEkonId !== user.ekonId
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only reply to your own tickets",
      });
    }

    const isCustomer = user.userType === "customer";

    ticket.replies.push({
      senderType: isCustomer ? "Customer" : "Admin",
      senderName: isCustomer
        ? user.name || ticket.customerName
        : user.fullName || "Admin",
      message,
      attachmentFileName: req.file ? req.file.filename : "",
      attachmentFilePath: req.file
        ? `/uploads/support-attachments/${req.file.filename}`
        : "",
      createdAt: new Date(),
    });

    if (ticket.status === "Closed" || ticket.status === "Resolved") {
      ticket.status = "In Progress";
    }

    await ticket.save();

    if (!isCustomer) {
      await CustomerNotification.create({
        notificationNumber: `CNT-${Date.now()}`,
        customerEkonId: ticket.customerEkonId,
        customerName: ticket.customerName,
        type: "Support Ticket",
        title: "Support Ticket Reply",
        message: `Eltham Konnect replied to your ticket "${ticket.subject}" (${ticket.ticketNumber}).`,
        isRead: false,
        date: new Date().toISOString().split("T")[0],
      });
    }

    res.json({
      success: true,
      message: "Reply added successfully",
      data: ticket,
    });
  } catch (error) {
    console.error("Error adding reply to support ticket:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add reply",
      error: error.message,
    });
  }
};

const updateTicketStatus = async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { status } = req.body;

    const validStatuses = ["Open", "In Progress", "Resolved", "Closed"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid support ticket status",
      });
    }

    const ticket = await SupportTicket.findOne({ ticketNumber });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found",
      });
    }

    ticket.status = status;
    await ticket.save();

    res.json({
      success: true,
      message: "Support ticket updated successfully",
      data: ticket,
    });
  } catch (error) {
    console.error("Error updating support ticket:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update support ticket",
      error: error.message,
    });
  }
};

module.exports = {
  getTickets,
  createTicket,
  addReplyToTicket,
  updateTicketStatus,
};