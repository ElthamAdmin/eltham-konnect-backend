const mongoose = require("mongoose");

const PointsHistorySchema = new mongoose.Schema({
  customerEkonId: {
    type: String,
    required: true,
  },

  customerName: {
    type: String,
    required: true,
  },

  action: {
    type: String,
    required: true,
  },

  points: {
    type: Number,
    required: true,
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

module.exports = mongoose.model("PointsHistory", PointsHistorySchema);