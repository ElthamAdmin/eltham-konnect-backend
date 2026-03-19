const mongoose = require("mongoose");

const SupportReplySchema = new mongoose.Schema(
  {
    senderType: {
      type: String,
      enum: ["Admin", "Customer"],
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    attachmentFileName: {
      type: String,
      default: "",
    },
    attachmentFilePath: {
      type: String,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const SupportTicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    required: true,
    unique: true,
  },
  customerEkonId: {
    type: String,
    required: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  attachmentFileName: {
    type: String,
    default: "",
  },
  attachmentFilePath: {
    type: String,
    default: "",
  },
  replies: {
    type: [SupportReplySchema],
    default: [],
  },
  status: {
    type: String,
    default: "Open",
  },
  date: {
    type: String,
    default: () => new Date().toISOString().split("T")[0],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);