const mongoose = require("mongoose");

const businessEntitySchema = new mongoose.Schema(
  {
    entityCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    legalName: {
      type: String,
      required: true,
      trim: true,
    },

    tradingName: {
      type: String,
      default: "",
      trim: true,
    },

    entityType: {
      type: String,
      enum: [
        "Sole Proprietorship",
        "Limited Liability Company",
        "Partnership",
      ],
      required: true,
      index: true,
    },

    lifecycleStatus: {
      type: String,
      enum: [
        "Planned",
        "Registration In Progress",
        "Registered",
        "Active",
        "Inactive",
        "Closed",
      ],
      default: "Planned",
      index: true,
    },

    effectiveFrom: {
      type: String,
      required: true,
      index: true,
    },

    effectiveTo: {
      type: String,
      default: "",
      index: true,
    },

    registrationNumber: {
      type: String,
      default: "",
      trim: true,
    },

    registrationDate: {
      type: String,
      default: "",
    },

    incorporationDate: {
      type: String,
      default: "",
    },

    trn: {
      type: String,
      default: "",
      trim: true,
    },

    registeredAddress: {
      type: String,
      default: "",
      trim: true,
    },

    businessEmail: {
      type: String,
      default: "",
      trim: true,
    },

    businessPhone: {
      type: String,
      default: "",
      trim: true,
    },

    fiscalYearStart: {
      type: String,
      default: "01-01",
    },

    fiscalYearEnd: {
      type: String,
      default: "12-31",
    },

    taxTreatment: {
      incomeTaxType: {
        type: String,
        enum: [
          "Individual Income Tax",
          "Company Income Tax",
          "Partnership Income Tax",
          "Not Configured",
        ],
        default: "Not Configured",
        index: true,
      },

      incomeTaxRuleCode: {
        type: String,
        default: "",
        trim: true,
      },

      gctRegistrationStatus: {
        type: String,
        enum: [
          "Not Registered",
          "Registration Pending",
          "Registered",
          "Suspended",
          "Cancelled",
        ],
        default: "Not Registered",
      },

      gctRegistrationCode: {
        type: String,
        default: "",
        trim: true,
      },

      payrollEmployerReference: {
        type: String,
        default: "",
        trim: true,
      },

      taxConfigurationStatus: {
        type: String,
        enum: [
          "Not Configured",
          "Draft",
          "Verified",
          "Active",
        ],
        default: "Not Configured",
      },
    },

    accountingConfiguration: {
      coaStructureCode: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      coaInitialized: {
        type: Boolean,
        default: false,
      },

      openingBalanceBatchNumber: {
        type: String,
        default: "",
        trim: true,
        index: true,
      },

      openingBalancesPosted: {
        type: Boolean,
        default: false,
      },

      openingBalancesPostedAt: {
        type: Date,
        default: null,
      },

      openingBalancesPostedBy: {
        type: String,
        default: "",
        trim: true,
      },

      reportingInitialized: {
        type: Boolean,
        default: false,
      },
    },

    predecessorEntityCode: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    successorEntityCode: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    transition: {
      transitionDate: {
        type: String,
        default: "",
      },

      transitionReason: {
        type: String,
        default: "",
        trim: true,
      },

      assetTransferRequired: {
        type: Boolean,
        default: false,
      },

      liabilityTransferRequired: {
        type: Boolean,
        default: false,
      },

      historicalRecordsLocked: {
        type: Boolean,
        default: false,
      },

      approvedBy: {
        type: String,
        default: "",
        trim: true,
      },

      approvedAt: {
        type: Date,
        default: null,
      },
    },

    directors: [
      {
        fullName: {
          type: String,
          required: true,
          trim: true,
        },

        role: {
          type: String,
          default: "Director",
          trim: true,
        },

        email: {
          type: String,
          default: "",
          trim: true,
        },

        phone: {
          type: String,
          default: "",
          trim: true,
        },

        effectiveFrom: {
          type: String,
          default: "",
        },

        effectiveTo: {
          type: String,
          default: "",
        },
      },
    ],

    shareholders: [
      {
        fullName: {
          type: String,
          required: true,
          trim: true,
        },

        sharesOwned: {
          type: Number,
          default: 0,
          min: 0,
        },

        ownershipPercent: {
          type: Number,
          default: 0,
          min: 0,
          max: 100,
        },

        effectiveFrom: {
          type: String,
          default: "",
        },

        effectiveTo: {
          type: String,
          default: "",
        },
      },
    ],

    authorizedShareCapital: {
      type: Number,
      default: 0,
      min: 0,
    },

    issuedShares: {
      type: Number,
      default: 0,
      min: 0,
    },

    companySecretary: {
      type: String,
      default: "",
      trim: true,
    },

    auditor: {
      type: String,
      default: "",
      trim: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
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

businessEntitySchema.index({
  lifecycleStatus: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
});

businessEntitySchema.pre(
  "validate",
  function validateBusinessEntity() {
    if (
      this.effectiveTo &&
      this.effectiveFrom > this.effectiveTo
    ) {
      throw new Error(
        "Entity effective-from date cannot be later than its effective-to date."
      );
    }

    if (
      this.lifecycleStatus === "Active" &&
      !this.trn
    ) {
      throw new Error(
        "An Active business entity requires a TRN."
      );
    }

    if (
      [
        "Registered",
        "Active",
      ].includes(this.lifecycleStatus) &&
      this.entityType ===
        "Limited Liability Company" &&
      !this.registrationNumber
    ) {
      throw new Error(
        "A registered LLC requires its company registration number."
      );
    }

    if (
      this.entityType !==
      "Limited Liability Company"
    ) {
      this.directors = [];
      this.shareholders = [];
      this.authorizedShareCapital = 0;
      this.issuedShares = 0;
      this.companySecretary = "";
    }

    const totalOwnership =
      this.shareholders.reduce(
        (sum, shareholder) =>
          sum +
          Number(
            shareholder.ownershipPercent || 0
          ),
        0
      );

    if (totalOwnership > 100) {
      throw new Error(
        "Total shareholder ownership cannot exceed 100 percent."
      );
    }
  }
);

module.exports = mongoose.model(
  "BusinessEntity",
  businessEntitySchema
);