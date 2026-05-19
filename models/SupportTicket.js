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

const InternalNoteSchema = new mongoose.Schema(
  {
    note: {
      type: String,
      required: true,
    },
    addedBy: {
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
    enum: ["Open", "In Progress", "Resolved", "Closed"],
    default: "Open",
  },

  priority: {
    type: String,
    enum: ["Low", "Medium", "High", "Critical"],
    default: "Medium",
  },

  category: {
    type: String,
    default: "General",
  },

  assignedTo: {
    type: String,
    default: "",
  },

    assignedToUserId: {
    type: String,
    default: "",
  },

  assignedToRole: {
    type: String,
    default: "",
  },

  internalNotes: {
    type: [InternalNoteSchema],
    default: [],
  },

  lastCustomerReplyAt: {
    type: Date,
    default: null,
  },

  lastStaffReplyAt: {
    type: Date,
    default: null,
  },

  satisfactionComment: {
    type: String,
    default: "",
  },

  firstResponseAt: {
    type: Date,
    default: null,
  },

  firstResponseMinutes: {
    type: Number,
    default: 0,
  },

  resolvedAt: {
    type: Date,
    default: null,
  },

  resolutionMinutes: {
    type: Number,
    default: 0,
  },

  reopenedCount: {
    type: Number,
    default: 0,
  },

  customerSatisfaction: {
    type: Number,
    default: 0,
  },

  escalationLevel: {
    type: String,
    enum: ["None", "Supervisor", "Management", "Critical"],
    default: "None",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);