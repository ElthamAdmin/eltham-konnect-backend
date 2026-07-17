const mongoose = require("mongoose");

const TaxRegistrationProfileSchema =
  new mongoose.Schema(
    {
      registrationCode: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
      },

      entityCode: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      entityName: {
        type: String,
        required: true,
        trim: true,
      },

      businessType: {
        type: String,
        enum: [
          "Sole Proprietorship",
          "Limited Liability Company",
          "Partnership",
        ],
        required: true,
        index: true,
      },

      taxType: {
        type: String,
        enum: ["GCT"],
        required: true,
        default: "GCT",
        index: true,
      },

      registrationStatus: {
        type: String,
        enum: [
          "Not Registered",
          "Registration Review",
          "Application In Progress",
          "Registered",
          "Suspended",
          "Deregistered",
        ],
        required: true,
        default: "Not Registered",
        index: true,
      },

      registrationNumber: {
        type: String,
        default: "",
        trim: true,
      },

      trn: {
        type: String,
        default: "",
        trim: true,
      },

      effectiveFrom: {
        type: Date,
        required: true,
        index: true,
      },

      effectiveTo: {
        type: Date,
        default: null,
        index: true,
      },

      turnoverThreshold: {
        amount: {
          type: Number,
          default: 0,
          min: 0,
        },

        currency: {
          type: String,
          default: "JMD",
          trim: true,
        },

        monitoringMonths: {
          type: Number,
          default: 12,
          min: 1,
        },

        effectiveFrom: {
          type: Date,
          default: null,
        },

        effectiveTo: {
          type: Date,
          default: null,
        },

        ruleCode: {
          type: String,
          default: "",
          trim: true,
        },
      },

      standardRate: {
        type: Number,
        default: 0,
        min: 0,
      },

      rateRuleCode: {
        type: String,
        default: "",
        trim: true,
      },

      sourceName: {
        type: String,
        default: "",
        trim: true,
      },

      sourceUrl: {
        type: String,
        default: "",
        trim: true,
      },

      sourceReference: {
        type: String,
        default: "",
        trim: true,
      },

      sourceVerifiedAt: {
        type: Date,
        default: null,
      },

      monitoringEnabled: {
        type: Boolean,
        default: true,
        index: true,
      },

      notes: {
        type: String,
        default: "",
        trim: true,
      },

      status: {
        type: String,
        enum: [
          "Draft",
          "Active",
          "Inactive",
          "Superseded",
        ],
        default: "Draft",
        index: true,
      },

      createdBy: {
        type: String,
        default: "",
        trim: true,
      },

      updatedBy: {
        type: String,
        default: "",
        trim: true,
      },
    },
    {
      timestamps: true,
    }
  );

TaxRegistrationProfileSchema.index({
  entityCode: 1,
  taxType: 1,
  effectiveFrom: -1,
  status: 1,
});

TaxRegistrationProfileSchema.pre(
  "validate",
  function validateRegistrationProfile() {
    if (
      this.effectiveTo &&
      this.effectiveFrom &&
      this.effectiveTo < this.effectiveFrom
    ) {
      throw new Error(
        "Effective-to date cannot be earlier than effective-from date."
      );
    }

    if (
      this.registrationStatus === "Registered" &&
      !this.registrationNumber
    ) {
      throw new Error(
        "A registered tax profile requires a registration number."
      );
    }

    if (
      this.status === "Active" &&
      (!this.sourceName ||
        (!this.sourceUrl &&
          !this.sourceReference) ||
        !this.sourceVerifiedAt)
    ) {
      throw new Error(
        "An active tax registration profile requires verified source information."
      );
    }

    if (
      this.registrationStatus === "Not Registered"
    ) {
      this.registrationNumber = "";
      this.standardRate = 0;
    }
  }
);

module.exports = mongoose.model(
  "TaxRegistrationProfile",
  TaxRegistrationProfileSchema
);