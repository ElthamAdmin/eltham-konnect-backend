const mongoose = require("mongoose");

const LoginAppearanceSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },

    wallpaperUrl: {
      type: String,
      default: "",
      maxlength: 1500,
    },

    wallpaperPublicId: {
      type: String,
      default: "",
      maxlength: 300,
    },

    wallpaperName: {
      type: String,
      default: "",
      maxlength: 180,
    },

    position: {
      type: String,
      enum: [
        "center",
        "top",
        "bottom",
        "left",
        "right",
      ],
      default: "center",
    },

    // Darkens the wallpaper while the login card stays opaque.
    overlayOpacity: {
      type: Number,
      default: 0.45,
      min: 0,
      max: 0.85,
    },

    heading: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },

    message: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },

    // Stored as timestamps. The Settings interface will
    // interpret entered dates and times in Jamaica time.
    startsAt: {
      type: Date,
      default: null,
    },

    endsAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

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

            additionalClosures: {
        type: [
          {
            date: {
              type: String,
              required: true,
            },
            name: {
              type: String,
              required: true,
              trim: true,
              maxlength: 200,
            },
            _id: false,
          },
        ],
        default: [],
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

        // Separate from logo branding so logo uploads and
    // general Settings saves cannot replace login appearance.
    loginAppearance: {
      admin: {
        type: LoginAppearanceSchema,
        default: () => ({}),
      },

      customer: {
        type: LoginAppearanceSchema,
        default: () => ({}),
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