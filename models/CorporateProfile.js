const mongoose = require("mongoose");

const corporateProfileSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      default: "Eltham Konnect",
    },

    tradingName: {
      type: String,
      default: "",
    },

    businessType: {
      type: String,
      enum: [
        "Sole Proprietorship",
        "Limited Liability Company",
        "Partnership",
      ],
      default: "Sole Proprietorship",
    },

    registrationNumber: {
      type: String,
      default: "",
    },

    trn: {
      type: String,
      default: "",
    },

    incorporationDate: {
      type: String,
      default: "",
    },

    fiscalYearStart: {
      type: String,
      default: "01-01",
    },

    fiscalYearEnd: {
      type: String,
      default: "12-31",
    },

    registeredAddress: {
      type: String,
      default: "",
    },

    businessEmail: {
      type: String,
      default: "",
    },

    businessPhone: {
      type: String,
      default: "",
    },

    directors: [
      {
        fullName: String,
        role: String,
        email: String,
        phone: String,
      },
    ],

    shareholders: [
      {
        fullName: String,
        sharesOwned: Number,
        ownershipPercent: Number,
      },
    ],

    authorizedShareCapital: {
      type: Number,
      default: 0,
    },

    issuedShares: {
      type: Number,
      default: 0,
    },

    companySecretary: {
      type: String,
      default: "",
    },

    auditor: {
      type: String,
      default: "",
    },

    legalNotes: {
      type: String,
      default: "",
    },

    transitionStatus: {
      type: String,
      enum: [
        "Not Started",
        "Planning",
        "Registration In Progress",
        "Registered",
        "Operational",
      ],
      default: "Not Started",
    },

    createdBy: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "CorporateProfile",
  corporateProfileSchema
);