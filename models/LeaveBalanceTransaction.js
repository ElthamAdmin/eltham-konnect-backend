const mongoose = require("mongoose");

const BALANCE_TYPES = [
  "Vacation",
  "Sick",
  "Emergency",
  "Other",
];

const TRANSACTION_TYPES = [
  "Opening Balance",
  "Accrual",
  "Annual Grant",
  "Carry Forward",
  "Approved Leave",
  "Manual Increase",
  "Manual Decrease",
  "Correction",
  "Reversal",
  "Expiry",
  "Termination Payout",
];

const UNIT_TYPES = [
  "Days",
  "Hours",
];

const TRANSACTION_STATUSES = [
  "Draft",
  "Posted",
  "Reversed",
  "Cancelled",
];

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidYmdDate = (value) => {
  if (value === null || value === undefined || value === "") {
    return true;
  }

  const text = String(value).trim();

  if (!YMD_PATTERN.test(text)) {
    return false;
  }

  const date = new Date(`${text}T12:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === text
  );
};

const LeaveBalanceTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    employeeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    employeeSnapshot: {
      fullName: {
        type: String,
        required: true,
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

      employmentStatus: {
        type: String,
        default: "",
        trim: true,
      },
    },

    balanceType: {
      type: String,
      enum: BALANCE_TYPES,
      required: true,
      index: true,
    },

    transactionType: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
      index: true,
    },

    unitType: {
      type: String,
      enum: UNIT_TYPES,
      default: "Days",
    },

    /*
     * Positive values increase the employee’s balance.
     * Negative values decrease the employee’s balance.
     */
    units: {
      type: Number,
      required: true,
    },

    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },

    effectiveDate: {
      type: String,
      required: true,
      trim: true,
      index: true,
      validate: {
        validator: isValidYmdDate,
        message:
          "Leave-balance effective date must use YYYY-MM-DD.",
      },
    },

    periodKey: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    policyCode: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    policySnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    leaveRequestId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    relatedTransactionNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    sourceType: {
      type: String,
      enum: [
        "Employee Master Migration",
        "Leave Policy",
        "Leave Request",
        "HR Adjustment",
        "Termination",
        "System Reversal",
        "Other",
      ],
      default: "Other",
    },

    sourceReference: {
      type: String,
      default: "",
      trim: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    supportingDocumentReference: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: TRANSACTION_STATUSES,
      default: "Draft",
      index: true,
    },

    postedBy: {
      type: String,
      default: "",
      trim: true,
    },

    postedByUserId: {
      type: String,
      default: "",
      trim: true,
    },

    postedAt: {
      type: Date,
      default: null,
    },

    reversedBy: {
      type: String,
      default: "",
      trim: true,
    },

    reversedByUserId: {
      type: String,
      default: "",
      trim: true,
    },

    reversedAt: {
      type: Date,
      default: null,
    },

    reversalReason: {
      type: String,
      default: "",
      trim: true,
    },

    cancelledBy: {
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

LeaveBalanceTransactionSchema.index({
  employeeId: 1,
  balanceType: 1,
  effectiveDate: 1,
  createdAt: 1,
});

LeaveBalanceTransactionSchema.index({
  employeeId: 1,
  balanceType: 1,
  status: 1,
});

LeaveBalanceTransactionSchema.index(
  {
    leaveRequestId: 1,
    transactionType: 1,
    status: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      leaveRequestId: {
        $type: "string",
        $gt: "",
      },
      transactionType: "Approved Leave",
      status: "Posted",
    },
  }
);

LeaveBalanceTransactionSchema.pre(
  "validate",
  function validateTransaction() {
    const units = Number(
      this.units || 0
    );

    const before = Number(
      this.balanceBefore || 0
    );

    const after = Number(
      this.balanceAfter || 0
    );

    if (units === 0) {
      throw new Error(
        "A leave-balance transaction must increase or decrease the balance."
      );
    }

    const expectedAfter = Number(
      (before + units).toFixed(4)
    );

    const normalizedAfter = Number(
      after.toFixed(4)
    );

    if (
      expectedAfter !==
      normalizedAfter
    ) {
      throw new Error(
        "Leave balance after the transaction must equal its opening balance plus the transaction units."
      );
    }

    if (after < 0) {
      throw new Error(
        "A posted leave-balance transaction cannot create a negative balance."
      );
    }

    if (
      this.status === "Posted" &&
      !this.postedAt
    ) {
      this.postedAt = new Date();
    }

    if (
      this.status === "Reversed" &&
      !this.relatedTransactionNumber
    ) {
      throw new Error(
        "A reversed leave-balance transaction must identify its related transaction."
      );
    }
  }
);

module.exports = mongoose.model(
  "LeaveBalanceTransaction",
  LeaveBalanceTransactionSchema
);