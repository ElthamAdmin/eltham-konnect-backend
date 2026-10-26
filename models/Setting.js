const mongoose = require("mongoose");

const SettingSchema = new mongoose.Schema(
  {
    settingKey: {
      type: String,
      required: true,
      unique: true,
      default: "main",
    },

    companyName: {
      type: String,
      default: "Eltham Konnect",
    },
    companyEmail: {
      type: String,
      default: "",
    },
    companyPhone: {
      type: String,
      default: "",
    },
    companyAddress: {
      type: String,
      default: "",
    },

    defaultCurrency: {
      type: String,
      default: "JMD",
    },

        storageFees: {
      enabled: {
        type: Boolean,
        default: false,
      },

      effectiveFrom: {
        type: String,
        default: "2027-01-01",
        enum: ["2027-01-01"],
      },

      currency: {
        type: String,
        default: "JMD",
        enum: ["JMD"],
      },

      freeBusinessDays: {
        type: Number,
        default: 7,
        enum: [7],
      },

      firstDayFee: {
        type: Number,
        default: 150,
        enum: [150],
      },

      additionalDailyFee: {
        type: Number,
        default: 50,
        enum: [50],
      },

      timeZone: {
        type: String,
        default: "America/Jamaica",
        enum: ["America/Jamaica"],
      },
    },

    branches: {
      type: [String],
      default: ["Eltham Park", "Browns Town Square"],
    },

    rewards: {
      atWarehousePoints: {
        type: Number,
        default: 100,
      },
      minimumRedeemPoints: {
        type: Number,
        default: 500,
      },
      inactivityExpiryMonths: {
        type: Number,
        default: 4,
      },
      pointsCap: {
        type: Number,
        default: 1500,
      },
    },

    invoice: {
      defaultStatus: {
        type: String,
        default: "Unpaid",
      },
      defaultPaymentTerms: {
        type: String,
        default: "Due on Receipt",
      },
    },

    communication: {
      defaultChannel: {
        type: String,
        default: "Email",
      },
      supportEmail: {
        type: String,
        default: "",
      },
      notificationsEnabled: {
        type: Boolean,
        default: true,
      },
    },

    branding: {
      primaryLogoName: {
        type: String,
        default: "",
      },
      primaryLogoPath: {
        type: String,
        default: "",
      },
      invoiceLogoName: {
        type: String,
        default: "",
      },
      invoiceLogoPath: {
        type: String,
        default: "",
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Setting", SettingSchema);