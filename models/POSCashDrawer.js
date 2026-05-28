const mongoose = require("mongoose");

const posCashDrawerSchema = new mongoose.Schema(
  {
    drawerNumber: {
      type: String,
      required: true,
      unique: true,
    },

    openedByUserId: {
      type: String,
      default: "",
    },

    openedByName: {
      type: String,
      default: "",
    },

    branch: {
  type: String,
  default: "Eltham Park Mainstore",
  trim: true,
  index: true,
},

    openingFloat: {
      type: Number,
      default: 0,
    },

    totalCashSales: {
      type: Number,
      default: 0,
    },

    totalCardSales: {
      type: Number,
      default: 0,
    },

    totalTransferSales: {
      type: Number,
      default: 0,
    },

    totalOtherSales: {
      type: Number,
      default: 0,
    },

    totalSales: {
      type: Number,
      default: 0,
    },

    expectedCash: {
      type: Number,
      default: 0,
    },

    closingCashCount: {
      type: Number,
      default: 0,
    },

    cashVariance: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["Open", "Closed"],
      default: "Open",
    },

    openedAt: {
      type: Date,
      default: Date.now,
    },

    closedAt: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("POSCashDrawer", posCashDrawerSchema);