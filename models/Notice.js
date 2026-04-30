const mongoose = require("mongoose");

const NoticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      enum: ["Urgent", "Daily Task", "Meeting", "Announcement", "General Update"],
      default: "General Update",
    },

    priority: {
      type: String,
      enum: ["Low", "Normal", "High", "Urgent"],
      default: "Normal",
    },

    postedByName: {
      type: String,
      default: "System User",
    },

    postedByRole: {
      type: String,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    dueDate: {
      type: Date,
      default: null,
    },

    imageFileName: {
  type: String,
  default: "",
},

imageFilePath: {
  type: String,
  default: "",
},

noticeType: {
  type: String,
  enum: ["Notice", "Memorandum"],
  default: "Notice",
},

signatureName: {
  type: String,
  default: "",
},

signatureTitle: {
  type: String,
  default: "",
},

stampText: {
  type: String,
  default: "Eltham Konnect",
},

  },
  { timestamps: true }
);



module.exports = mongoose.model("Notice", NoticeSchema);