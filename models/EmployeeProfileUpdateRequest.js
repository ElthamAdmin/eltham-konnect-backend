const mongoose = require("mongoose");

const ProfileChangeSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      required: true,
      trim: true,
    },

    label: {
      type: String,
      required: true,
      trim: true,
    },

    currentValue: {
      type: String,
      default: "",
      trim: true,
    },

    requestedValue: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const ProfileRequestHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },

    fromStatus: {
      type: String,
      default: "",
      trim: true,
    },

    toStatus: {
      type: String,
      default: "",
      trim: true,
    },

    performedBy: {
      type: String,
      default: "",
      trim: true,
    },

    performedByUserId: {
      type: String,
      default: "",
      trim: true,
    },

    performedAt: {
      type: Date,
      default: Date.now,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    _id: true,
  }
);

const EmployeeProfileUpdateRequestSchema =
  new mongoose.Schema(
    {
      requestNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },

      employeeId: {
        type: String,
        required: true,
        index: true,
        trim: true,
      },

      linkedUserId: {
        type: String,
        default: "",
        index: true,
        trim: true,
      },

      employeeSnapshot: {
        fullName: {
          type: String,
          default: "",
          trim: true,
        },

        jobTitle: {
          type: String,
          default: "",
          trim: true,
        },

        department: {
          type: String,
          default: "",
          trim: true,
        },

        branch: {
          type: String,
          default: "",
          trim: true,
        },
      },

      changes: {
        type: [ProfileChangeSchema],
        default: [],
      },

      reason: {
        type: String,
        required: true,
        trim: true,
      },

      status: {
        type: String,
        enum: [
          "Pending",
          "Approved",
          "Rejected",
          "Cancelled",
        ],
        default: "Pending",
        index: true,
      },

      requestedBy: {
        type: String,
        required: true,
        trim: true,
      },

      requestedByUserId: {
        type: String,
        required: true,
        trim: true,
      },

      requestedAt: {
        type: Date,
        default: Date.now,
      },

      reviewedBy: {
        type: String,
        default: "",
        trim: true,
      },

      reviewedByUserId: {
        type: String,
        default: "",
        trim: true,
      },

      reviewedAt: {
        type: Date,
        default: null,
      },

      reviewNotes: {
        type: String,
        default: "",
        trim: true,
      },

      cancelledAt: {
        type: Date,
        default: null,
      },

      cancellationReason: {
        type: String,
        default: "",
        trim: true,
      },

      history: {
        type: [ProfileRequestHistorySchema],
        default: [],
      },
    },
    {
      timestamps: true,
    }
  );

EmployeeProfileUpdateRequestSchema.index({
  employeeId: 1,
  status: 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  "EmployeeProfileUpdateRequest",
  EmployeeProfileUpdateRequestSchema
);