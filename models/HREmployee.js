const mongoose = require("mongoose");

const HREmployeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    firstName: {
      type: String,
      default: "",
      trim: true,
    },

    lastName: {
      type: String,
      default: "",
      trim: true,
    },

    gender: {
      type: String,
      enum: ["Male", "Female", "Other", ""],
      default: "",
    },

    dateOfBirth: {
      type: String,
      default: "",
    },

    trn: {
      type: String,
      default: "",
      trim: true,
    },

    nisNumber: {
      type: String,
      default: "",
      trim: true,
    },

    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    alternatePhone: {
      type: String,
      default: "",
      trim: true,
    },

    address: {
      type: String,
      default: "",
      trim: true,
    },

    emergencyContactName: {
      type: String,
      default: "",
      trim: true,
    },

    emergencyContactPhone: {
      type: String,
      default: "",
      trim: true,
    },

    emergencyContactRelationship: {
      type: String,
      default: "",
      trim: true,
    },

    department: {
      type: String,
      default: "Operations",
      trim: true,
    },

    jobTitle: {
      type: String,
      required: true,
      trim: true,
    },

    branch: {
      type: String,
      default: "Eltham Park Mainstore",
      trim: true,
    },

    employmentType: {
      type: String,
      enum: ["Permanent", "Temporary", "Part-Time", "Contract", "Probation"],
      default: "Temporary",
    },

    startDate: {
      type: String,
      default: "",
    },

    endDate: {
      type: String,
      default: "",
    },

    employmentStatus: {
      type: String,
      enum: ["Active", "Inactive", "On Leave", "Terminated"],
      default: "Active",
    },

    payType: {
      type: String,
      enum: ["Monthly Salary", "Weekly Wage", "Daily Rate", "Hourly Rate"],
      default: "Monthly Salary",
    },

    payRate: {
      type: Number,
      default: 0,
    },

    payrollEnabled: {
      type: Boolean,
      default: true,
    },

    linkedUserId: {
      type: String,
      default: "",
      trim: true,
    },

    attendanceRequired: {
      type: Boolean,
      default: true,
    },

    leaveBalanceVacation: {
      type: Number,
      default: 0,
    },

    leaveBalanceSick: {
      type: Number,
      default: 0,
    },

    leaveBalanceUnpaid: {
      type: Number,
      default: 0,
    },

    documents: [
      {
        documentName: {
          type: String,
          default: "",
        },
        documentType: {
          type: String,
          default: "",
        },
        fileUrl: {
          type: String,
          default: "",
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

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

module.exports = mongoose.model("HREmployee", HREmployeeSchema);