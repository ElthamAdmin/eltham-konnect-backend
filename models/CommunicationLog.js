const mongoose = require("mongoose");

const CommunicationLogSchema = new mongoose.Schema({
  logNumber: {
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
  channel: {
    type: String,
    required: true,
    default: "Email",
  },
  subject: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    default: "Sent",
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

module.exports = mongoose.model("CommunicationLog", CommunicationLogSchema);