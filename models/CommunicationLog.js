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
  recipientMode: {
    type: String,
    default: "single",
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
    default: () => {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Jamaica",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return formatter.format(new Date());
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("CommunicationLog", CommunicationLogSchema);